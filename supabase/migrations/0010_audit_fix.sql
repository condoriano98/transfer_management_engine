-- ============================================================================
-- 0010_audit_fix.sql — fix log_audit_event for tables without a status column
-- ============================================================================
-- The log_audit_event function referenced old.status / new.status directly.
-- When Postgres compiles the trigger body against tables without a 'status'
-- column (accounts, approval_rules, memberships), it raises:
--   ERROR: record "old" has no field "status"
-- even for INSERT triggers where the branch is never reached. The type-check
-- is done against the table schema at plan time.
--
-- Fix: use to_jsonb(record)->>'status' which safely returns NULL for missing
-- fields and NULL records, instead of raising a schema error.
-- ============================================================================

create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
  new_status text;
begin
  old_status := to_jsonb(old)->>'status';
  new_status := to_jsonb(new)->>'status';

  insert into audit_log (org_id, actor_id, action, entity_type, entity_id, before, after)
  values (
    coalesce(new.org_id, old.org_id),
    coalesce(auth.uid(), null),
    case
      when tg_op = 'INSERT' then 'created'
      when tg_op = 'DELETE' then 'deleted'
      when tg_op = 'UPDATE' and old_status is distinct from new_status
        then coalesce(old_status,'?') || '→' || coalesce(new_status,'?')
      else 'updated'
    end,
    tg_table_name,
    coalesce(new.id, old.id)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;
