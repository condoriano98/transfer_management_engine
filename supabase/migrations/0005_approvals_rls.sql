-- ============================================================================
-- 0005_approvals_rls.sql — add missing RLS policies for approval flow
-- ============================================================================
-- The 0003 migration had policies for select on all tables, insert for
-- transfer_requests (limited to requestor), and cancel updates (requestor
-- only). Missing:
--   1. transfer_requests update for approvers (approve/reject)
--   2. approvals insert for approvers
--   3. transfers insert for administrators
--
-- Without these, decideApproval() and settleTransfer() fail at the RLS level
-- when called via cookie-bound supabaseServer().

-- 1) Replace the narrow transfer_requests_cancel policy with a broader update
--    policy that also allows finance/admin to transition status.
drop policy if exists transfer_requests_cancel on transfer_requests;

create policy transfer_requests_update on transfer_requests
  for update using (
    org_id in (select current_user_orgs())
    and (
      -- requester can act on their own pending requests (cancel)
      (requested_by = auth.uid() and status = 'pending')
      or
      -- finance/admin can transition any non-terminal request
      current_user_role(org_id) in ('admin', 'finance')
    )
  );

-- 2) Finance/admin can record approval decisions.
create policy approvals_insert on approvals
  for insert with check (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) in ('admin', 'finance')
  );

-- 3) Finance/admin can insert transfer execution records.
create policy transfers_insert on transfers
  for insert with check (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) in ('admin', 'finance')
  );
