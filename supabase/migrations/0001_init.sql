-- ============================================================================
-- 0001_init.sql — orgs, memberships, RBAC, audit log, RLS bootstrap
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------- enums ----------
create type role as enum ('admin', 'finance', 'ads_manager', 'viewer');

-- ---------- orgs & membership ----------
create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        citext not null unique,
  created_at  timestamptz not null default now()
);

create table memberships (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index memberships_user_idx on memberships(user_id);

-- ---------- helper: current user's orgs ----------
create or replace function current_user_orgs()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from memberships where user_id = auth.uid();
$$;

create or replace function current_user_role(p_org uuid)
returns role
language sql
stable
security definer
set search_path = public
as $$
  select role from memberships
  where user_id = auth.uid() and org_id = p_org
  limit 1;
$$;

-- ---------- audit log (append-only) ----------
create table audit_log (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references orgs(id) on delete cascade,
  actor_id     uuid references auth.users(id),
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_org_idx on audit_log(org_id, created_at desc);

-- ---------- signup hook: every new user gets a personal org ----------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  new_slug citext;
begin
  new_slug := lower(regexp_replace(coalesce(new.email, new.id::text), '[^a-zA-Z0-9]+', '-', 'g'));
  insert into orgs (name, slug)
  values (coalesce(new.raw_user_meta_data->>'org_name', new.email, 'Personal'),
          new_slug || '-' || substr(new.id::text, 1, 8))
  returning id into new_org_id;
  insert into memberships (org_id, user_id, role) values (new_org_id, new.id, 'admin');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- RLS ----------
alter table orgs        enable row level security;
alter table memberships enable row level security;
alter table audit_log   enable row level security;

create policy orgs_select on orgs
  for select using (id in (select current_user_orgs()));

create policy orgs_update on orgs
  for update using (
    id in (select current_user_orgs())
    and current_user_role(id) = 'admin'
  );

create policy memberships_select on memberships
  for select using (org_id in (select current_user_orgs()));

create policy memberships_write on memberships
  for all using (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) = 'admin'
  ) with check (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) = 'admin'
  );

create policy audit_log_select on audit_log
  for select using (org_id in (select current_user_orgs()));
-- audit_log is never directly written/updated by clients; service role only.
