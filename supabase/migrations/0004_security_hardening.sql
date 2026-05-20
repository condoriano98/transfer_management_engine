-- ============================================================================
-- 0004_security_hardening.sql — fix Supabase advisor findings
-- ============================================================================

-- 1) account_balances view must use security_invoker so RLS on the underlying
--    tables (accounts, ledger_entries) applies to the caller, not the creator.
drop view if exists account_balances;
create view account_balances
with (security_invoker = true)
as
select
  a.id            as account_id,
  a.org_id,
  a.code,
  a.name,
  a.type,
  a.currency,
  coalesce(sum(case when le.direction = 'debit'  then le.amount else 0 end), 0) as total_debit,
  coalesce(sum(case when le.direction = 'credit' then le.amount else 0 end), 0) as total_credit,
  case
    when a.type in ('asset', 'expense')
      then coalesce(sum(case when le.direction = 'debit'  then le.amount else -le.amount end), 0)
    else  coalesce(sum(case when le.direction = 'credit' then le.amount else -le.amount end), 0)
  end as balance
from accounts a
left join ledger_entries le on le.account_id = a.id
group by a.id, a.org_id, a.code, a.name, a.type, a.currency;

-- 2) Pin search_path on the remaining mutable-search-path functions.
alter function ledger_entries_immutable() set search_path = public;
alter function check_journal_balance()    set search_path = public;
alter function bump_updated_at()          set search_path = public;

-- 3) Trigger-only functions must not be callable via the REST API.
--    They are still invoked by their triggers — execute privilege controls
--    direct RPC calls only.
revoke execute on function handle_new_user()             from public, anon, authenticated;
revoke execute on function seed_default_accounts()       from public, anon, authenticated;
revoke execute on function seed_default_approval_rule()  from public, anon, authenticated;

-- 4) post_journal is the only intentional RPC. Anon must not call it.
revoke execute on function post_journal(uuid, text, text, jsonb) from public, anon;
grant  execute on function post_journal(uuid, text, text, jsonb) to authenticated;

-- current_user_orgs / current_user_role stay callable: they're how RLS works
-- and they reveal nothing the caller couldn't already see via their own
-- membership rows.
