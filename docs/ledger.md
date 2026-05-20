# Double-entry ledger

## Tables

- `accounts(id, org_id, code, name, type, currency)` — chart of accounts per org.
- `journals(id, org_id, ref, memo, created_by, created_at)` — one row per business event.
- `ledger_entries(id, journal_id, account_id, direction, amount, currency)` — append-only.

## Invariants

1. Every `journal` must have at least 2 `ledger_entries`.
2. For each journal, `sum(debits) == sum(credits)`. Enforced by a deferrable
   constraint trigger that runs at commit time.
3. `ledger_entries` cannot be updated or deleted (trigger raises).
4. `amount` is a positive `bigint` in minor units (sen/cents).

## Posting a journal

Always through the DB function `post_journal(org_id, memo, ref, lines jsonb)`.
The `lib/ledger/post.ts` wrapper validates with zod, computes debit/credit
totals client-side as an early reject, then calls the RPC.

## Account semantics

| type        | balance formula           |
|-------------|---------------------------|
| asset       | debits − credits          |
| expense     | debits − credits          |
| liability   | credits − debits          |
| equity      | credits − debits          |
| revenue     | credits − debits          |

The `account_balances` view computes balance using these rules.

## Example: pool replenishment (drawdown on cash line)

```
debit  pool        100,000,000
credit cash_line   100,000,000
```

`pool` is an asset (+100M); `cash_line` is a liability (+100M). Net equity
unchanged. The view shows pool balance going up, cash_line balance going up.

## Example: ad spend settlement

```
debit  meta_ads    5,000,000
credit pool        5,000,000
```

`meta_ads` is an expense (+5M, increases recognised cost); pool decreases.

## Why not use mutable balance columns

The reference design (`adspend-platform`) keeps `available_balance` and
`spent_balance` as columns on `budget_pool`. Any process that forgets to
update both can leave the data inconsistent forever; debugging means
re-aggregating from logs. With a ledger, the data IS the audit trail.
