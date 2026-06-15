-- ============================================================================
-- 0011_audit_fix_v2.sql — fully convert audit functions to JSONB-safe access
-- ============================================================================
-- 0010 fixed old.status/new.status, but new.id/old.id and new.org_id/old.org_id
-- still used direct record field access. Tables without an 'id' column
-- (memberships, mandiri_statement_lines, recon_runs, event_deliveries) or
-- without 'org_id' (orgs) caused plan-time errors:
--   ERROR: record "new" has no field "id"
--
-- Fix: convert EVERY record field reference to to_jsonb(record)->>'field'.
-- ============================================================================

create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (org_id, actor_id, action, entity_type, entity_id, before, after)
  values (
    coalesce(
      (to_jsonb(new)->>'org_id')::uuid,
      (to_jsonb(old)->>'org_id')::uuid
    ),
    coalesce(auth.uid(), null),
    case
      when tg_op = 'INSERT' then 'created'
      when tg_op = 'DELETE' then 'deleted'
      when tg_op = 'UPDATE'
        and to_jsonb(old)->>'status' is distinct from to_jsonb(new)->>'status'
        then coalesce(to_jsonb(old)->>'status','?') || '→'
          || coalesce(to_jsonb(new)->>'status','?')
      else 'updated'
    end,
    tg_table_name,
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

create or replace function log_org_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (org_id, actor_id, action, entity_type, entity_id, before, after)
  values (
    coalesce(
      (to_jsonb(new)->>'id')::uuid,
      (to_jsonb(old)->>'id')::uuid
    ),
    coalesce(auth.uid(), null),
    case
      when tg_op = 'INSERT' then 'created'
      when tg_op = 'DELETE' then 'deleted'
      else 'updated'
    end,
    'orgs',
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;
