-- ============================================================================
-- 0009_audit_extended.sql — audit triggers on policy/admin tables
-- ============================================================================
-- Extends the audit_log population from 0006 (transfer_requests, approvals,
-- transfers) to cover accounts, approval_rules, memberships, and orgs.
-- Every role change, rule adjustment, and account modification is now
-- recorded with before/after jsonb snapshots.
-- ============================================================================

-- The log_audit_event() function from 0006 works for tables with an org_id
-- column. For orgs (where the org IS the entity), use a dedicated trigger
-- that maps the org's own id as the org_id.

create or replace function log_org_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (org_id, actor_id, action, entity_type, entity_id, before, after)
  values (
    coalesce(new.id, old.id),
    coalesce(auth.uid(), null),
    case
      when tg_op = 'INSERT' then 'created'
      when tg_op = 'DELETE' then 'deleted'
      when tg_op = 'UPDATE' then 'updated'
    end,
    'orgs',
    coalesce(new.id, old.id)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

-- ====== accounts ======
drop trigger if exists audit_accounts on accounts;
create trigger audit_accounts
  after insert or update or delete on accounts
  for each row execute function log_audit_event();

-- ====== approval_rules ======
drop trigger if exists audit_approval_rules on approval_rules;
create trigger audit_approval_rules
  after insert or update or delete on approval_rules
  for each row execute function log_audit_event();

-- ====== memberships ======
drop trigger if exists audit_memberships on memberships;
create trigger audit_memberships
  after insert or update or delete on memberships
  for each row execute function log_audit_event();

-- ====== orgs ======
drop trigger if exists audit_orgs on orgs;
create trigger audit_orgs
  after insert or update on orgs
  for each row execute function log_org_audit_event();
