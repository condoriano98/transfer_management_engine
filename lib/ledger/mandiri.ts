/**
 * Journal-composition helpers for Mandiri pool events.
 *
 * Each function maps one bank-side event to the exact double-entry journal
 * that should land in the org's ledger. Routes (webhooks, recon, transfer
 * settlement) call these instead of building journal lines inline.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { postJournal } from "@/lib/ledger/post";

const IDR = "IDR";

/**
 * Mandiri credit landed in the pool, attributed to a specific org via a
 * pending_topups reference. The org's working pool grows and their
 * cash-line liability grows by the same amount.
 *
 * Journal: DR pool / CR cash_line
 */
export async function postTopupCredit(
  sb: SupabaseClient,
  input: {
    org_id: string;
    amount: number;
    mandiri_ref: string;
    memo?: string;
  },
): Promise<string> {
  return postJournal(sb, {
    org_id: input.org_id,
    memo: input.memo ?? `mandiri top-up ${input.mandiri_ref}`,
    ref: `mandiri_topup:${input.mandiri_ref}`,
    lines: [
      { account_code: "pool",      direction: "debit",  amount: input.amount, currency: IDR },
      { account_code: "cash_line", direction: "credit", amount: input.amount, currency: IDR },
    ],
  });
}

/**
 * Mandiri accepted a disbursement request. Funds are committed at the
 * bank but not yet cleared at the counterparty. The org's spendable pool
 * drops immediately so they can't double-spend.
 *
 * Journal: DR pending_transfers / CR pool
 */
export async function postDisbursementInflight(
  sb: SupabaseClient,
  input: {
    org_id: string;
    amount: number;
    transfer_id: string;
    mandiri_ref: string;
  },
): Promise<string> {
  return postJournal(sb, {
    org_id: input.org_id,
    memo: `mandiri disbursement in-flight ${input.mandiri_ref}`,
    ref: `transfer:${input.transfer_id}:inflight`,
    lines: [
      { account_code: "pending_transfers", direction: "debit",  amount: input.amount, currency: IDR },
      { account_code: "pool",              direction: "credit", amount: input.amount, currency: IDR },
    ],
  });
}

/**
 * Disbursement cleared at the counterparty. Move the in-flight amount to
 * the expense category that drove the spend.
 *
 * Journal: DR <expense> / CR pending_transfers
 */
export async function postDisbursementCleared(
  sb: SupabaseClient,
  input: {
    org_id: string;
    amount: number;
    transfer_id: string;
    expense_account_code: string;
    mandiri_ref: string;
  },
): Promise<string> {
  return postJournal(sb, {
    org_id: input.org_id,
    memo: `mandiri disbursement cleared ${input.mandiri_ref}`,
    ref: `transfer:${input.transfer_id}:cleared`,
    lines: [
      { account_code: input.expense_account_code, direction: "debit",  amount: input.amount, currency: IDR },
      { account_code: "pending_transfers",        direction: "credit", amount: input.amount, currency: IDR },
    ],
  });
}

/**
 * Disbursement failed at Mandiri or counterparty. Reverse the in-flight
 * journal so the org's pool balance is restored.
 *
 * Journal: DR pool / CR pending_transfers
 */
export async function postDisbursementFailed(
  sb: SupabaseClient,
  input: {
    org_id: string;
    amount: number;
    transfer_id: string;
    mandiri_ref: string;
    reason?: string;
  },
): Promise<string> {
  const reason = input.reason ? `: ${input.reason}` : "";
  return postJournal(sb, {
    org_id: input.org_id,
    memo: `mandiri disbursement failed ${input.mandiri_ref}${reason}`,
    ref: `transfer:${input.transfer_id}:failed`,
    lines: [
      { account_code: "pool",              direction: "debit",  amount: input.amount, currency: IDR },
      { account_code: "pending_transfers", direction: "credit", amount: input.amount, currency: IDR },
    ],
  });
}
