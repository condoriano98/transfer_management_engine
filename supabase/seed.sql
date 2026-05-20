-- Demo seed (run after migrations and after creating at least one user via Supabase Auth).
-- Picks the first user and posts a starter journal so the dashboard isn't empty.

do $$
declare
  uid uuid;
  oid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise notice 'no users yet; sign up first, then re-run seed.';
    return;
  end if;
  select org_id into oid from memberships where user_id = uid limit 1;
  if oid is null then return; end if;

  -- 100,000,000 minor units = 1,000,000.00 (e.g. IDR)
  perform post_journal(
    oid,
    'Initial cash line drawdown',
    'seed:initial',
    jsonb_build_array(
      jsonb_build_object('account_code','pool',     'direction','debit',  'amount', 100000000, 'currency','IDR'),
      jsonb_build_object('account_code','cash_line','direction','credit', 'amount', 100000000, 'currency','IDR')
    )
  );
end$$;
