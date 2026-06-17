-- ============================================================================
-- 0012_transactional_actions.sql — atomic RPC functions for critical actions
--
-- Fixes race conditions in settleTransfer and decideApproval by wrapping
-- all operations in a single transaction with advisory locking.
-- ============================================================================

-- Helper: acquire advisory lock for a request_id (prevents concurrent operations)
create or replace function acquire_request_lock(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Use the request_id's hash as the lock key
  -- pg_advisory_xact_lock is automatically released at transaction end
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
end;
$$;

-- Atomic settle_transfer: wraps journal posting + transfer insert + status update
create or replace function settle_transfer_atomic(
  p_request_id uuid,
  p_provider text,
  p_provider_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_from_acc record;
  v_to_acc record;
  v_journal_id uuid;
  v_current_status text;
  v_new_status text;
begin
  -- Acquire advisory lock to prevent concurrent settlements
  perform acquire_request_lock(p_request_id);

  -- Fetch request with lock
  select id, org_id, from_account_id, to_account_id, amount, currency, status
  into v_req
  from transfer_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'transfer request not found: %', p_request_id;
  end if;

  -- Check if already terminal
  if v_req.status in ('settled', 'rejected', 'cancelled', 'failed') then
    return jsonb_build_object('already_settled', true, 'status', v_req.status);
  end if;

  -- Fetch account codes
  select code into v_from_acc from accounts where id = v_req.from_account_id;
  select code into v_to_acc from accounts where id = v_req.to_account_id;

  if v_from_acc is null or v_to_acc is null then
    raise exception 'account not found';
  end if;

  -- Post journal (this calls post_journal internally)
  v_journal_id := post_journal(
    v_req.org_id,
    format('transfer %s', v_req.id),
    format('transfer:%s', v_req.id),
    jsonb_build_array(
      jsonb_build_object('account_code', v_to_acc.code, 'direction', 'debit', 'amount', v_req.amount, 'currency', v_req.currency),
      jsonb_build_object('account_code', v_from_acc.code, 'direction', 'credit', 'amount', v_req.amount, 'currency', v_req.currency)
    )
  );

  -- Insert transfer record
  insert into transfers (
    request_id, org_id, provider, provider_ref, status,
    journal_id, executed_at, settled_at
  ) values (
    v_req.id, v_req.org_id, p_provider, p_provider_ref, 'success',
    v_journal_id, now(), now()
  );

  -- Update request status
  v_current_status := v_req.status;
  if v_current_status != 'executing' then
    v_current_status := 'executing';
  end if;
  v_new_status := 'settled';

  update transfer_requests
  set status = v_new_status
  where id = p_request_id;

  return jsonb_build_object('journal_id', v_journal_id, 'status', v_new_status);
end;
$$;

-- Atomic decide_approval: wraps approval insert + count check + status transition
create or replace function decide_approval_atomic(
  p_request_id uuid,
  p_approver_id uuid,
  p_decision text,
  p_notes text,
  p_required_count int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_approval_count int;
  v_new_status text;
begin
  -- Acquire advisory lock
  perform acquire_request_lock(p_request_id);

  -- Fetch request with lock
  select id, org_id, status, requested_by
  into v_req
  from transfer_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'transfer request not found: %', p_request_id;
  end if;

  -- Self-approval check
  if v_req.requested_by = p_approver_id then
    raise exception 'FORBIDDEN: cannot approve your own transfer request';
  end if;

  -- Insert approval record
  insert into approvals (request_id, org_id, approver_id, decision, notes, channel)
  values (p_request_id, v_req.org_id, p_approver_id, p_decision, p_notes, 'in_app');

  -- Handle rejection (immediate transition)
  if p_decision = 'reject' then
    v_new_status := 'rejected';
    update transfer_requests set status = v_new_status where id = p_request_id;
    return jsonb_build_object('status', v_new_status, 'transitioned', true);
  end if;

  -- Count approvals
  select count(*) into v_approval_count
  from approvals
  where request_id = p_request_id and decision = 'approve';

  -- Check if threshold met
  if v_approval_count >= p_required_count and v_req.status = 'pending' then
    v_new_status := 'approved';
    update transfer_requests
    set status = v_new_status, approved_at = now()
    where id = p_request_id;
    return jsonb_build_object('status', v_new_status, 'transitioned', true);
  end if;

  return jsonb_build_object('status', v_req.status, 'transitioned', false);
end;
$$;
