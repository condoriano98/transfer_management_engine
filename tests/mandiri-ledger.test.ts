import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  postTopupCredit,
  postDisbursementInflight,
  postDisbursementCleared,
  postDisbursementFailed,
} from "@/lib/ledger/mandiri";
import { MockMandiriClient } from "@/lib/adapters/mandiri";

const ORG = "11111111-1111-1111-1111-111111111111";

type RpcArgs = {
  p_org_id: string;
  p_memo: string;
  p_ref: string | null;
  p_lines: Array<{
    account_code: string;
    direction: "debit" | "credit";
    amount: number;
    currency: string;
  }>;
};

function fakeSb() {
  const calls: Array<{ fn: string; args: RpcArgs }> = [];
  const sb = {
    rpc: (fn: string, args: RpcArgs) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: `journal-${calls.length}`, error: null });
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

describe("mandiri ledger composition", () => {
  it("top-up credit posts DR pool / CR cash_line", async () => {
    const { sb, calls } = fakeSb();
    const id = await postTopupCredit(sb, {
      org_id: ORG,
      amount: 10_000_000,
      mandiri_ref: "MDR-0001",
    });
    expect(id).toBe("journal-1");
    expect(calls[0].args.p_org_id).toBe(ORG);
    expect(calls[0].args.p_ref).toBe("mandiri_topup:MDR-0001");
    expect(calls[0].args.p_lines).toEqual([
      { account_code: "pool",      direction: "debit",  amount: 10_000_000, currency: "IDR" },
      { account_code: "cash_line", direction: "credit", amount: 10_000_000, currency: "IDR" },
    ]);
  });

  it("disbursement in-flight posts DR pending_transfers / CR pool", async () => {
    const { sb, calls } = fakeSb();
    await postDisbursementInflight(sb, {
      org_id: ORG,
      amount: 500_000,
      transfer_id: "tx-1",
      mandiri_ref: "MDR-0002",
    });
    expect(calls[0].args.p_ref).toBe("transfer:tx-1:inflight");
    expect(calls[0].args.p_lines).toEqual([
      { account_code: "pending_transfers", direction: "debit",  amount: 500_000, currency: "IDR" },
      { account_code: "pool",              direction: "credit", amount: 500_000, currency: "IDR" },
    ]);
  });

  it("disbursement cleared posts DR <expense> / CR pending_transfers", async () => {
    const { sb, calls } = fakeSb();
    await postDisbursementCleared(sb, {
      org_id: ORG,
      amount: 500_000,
      transfer_id: "tx-1",
      expense_account_code: "meta_ads",
      mandiri_ref: "MDR-0002",
    });
    expect(calls[0].args.p_ref).toBe("transfer:tx-1:cleared");
    expect(calls[0].args.p_lines).toEqual([
      { account_code: "meta_ads",          direction: "debit",  amount: 500_000, currency: "IDR" },
      { account_code: "pending_transfers", direction: "credit", amount: 500_000, currency: "IDR" },
    ]);
  });

  it("disbursement failed reverses in-flight: DR pool / CR pending_transfers", async () => {
    const { sb, calls } = fakeSb();
    await postDisbursementFailed(sb, {
      org_id: ORG,
      amount: 500_000,
      transfer_id: "tx-1",
      mandiri_ref: "MDR-0002",
      reason: "destination account closed",
    });
    expect(calls[0].args.p_memo).toContain("destination account closed");
    expect(calls[0].args.p_lines).toEqual([
      { account_code: "pool",              direction: "debit",  amount: 500_000, currency: "IDR" },
      { account_code: "pending_transfers", direction: "credit", amount: 500_000, currency: "IDR" },
    ]);
  });

  it("full happy lifecycle preserves the accounting identity", async () => {
    // top-up 10M -> in-flight 3M -> cleared 3M
    // Expected net balances (positive numbers, computed per account type):
    //   pool (asset)              = +10M - 3M    =  7M
    //   pending_transfers (asset) = +3M  - 3M    =  0
    //   meta_ads (expense)        = +3M          =  3M
    //   cash_line (liability)     = +10M         = 10M
    // Identity: assets + expenses = liabilities
    //           7M + 0 + 3M = 10M ✓
    const { sb, calls } = fakeSb();
    await postTopupCredit(sb, { org_id: ORG, amount: 10_000_000, mandiri_ref: "T1" });
    await postDisbursementInflight(sb, { org_id: ORG, amount: 3_000_000, transfer_id: "x", mandiri_ref: "D1" });
    await postDisbursementCleared(sb, {
      org_id: ORG, amount: 3_000_000, transfer_id: "x",
      expense_account_code: "meta_ads", mandiri_ref: "D1",
    });

    const balances: Record<string, { type: "asset" | "expense" | "liability"; bal: number }> = {
      pool:              { type: "asset",     bal: 0 },
      pending_transfers: { type: "asset",     bal: 0 },
      meta_ads:          { type: "expense",   bal: 0 },
      cash_line:         { type: "liability", bal: 0 },
    };
    for (const c of calls) {
      for (const line of c.args.p_lines) {
        const acc = balances[line.account_code];
        if (!acc) continue;
        const sign =
          acc.type === "liability"
            ? line.direction === "credit" ? 1 : -1
            : line.direction === "debit"  ? 1 : -1;
        acc.bal += sign * line.amount;
      }
    }
    expect(balances.pool.bal).toBe(7_000_000);
    expect(balances.pending_transfers.bal).toBe(0);
    expect(balances.meta_ads.bal).toBe(3_000_000);
    expect(balances.cash_line.bal).toBe(10_000_000);

    const assets   = balances.pool.bal + balances.pending_transfers.bal;
    const expenses = balances.meta_ads.bal;
    const liabs    = balances.cash_line.bal;
    expect(assets + expenses).toBe(liabs);
  });
});

describe("MockMandiriClient", () => {
  it("returns the configured disburse result by idempotency key", async () => {
    const m = new MockMandiriClient();
    m.setDisburseResult("k-1", { ref: "MDR-ABC", status: "success" });
    const r = await m.disburse({
      idempotencyKey: "k-1",
      destBank: "BMRI", destAccount: "1234567890", destName: "ACME",
      amount: 100_000, remark: "test",
    });
    expect(r).toEqual({ ref: "MDR-ABC", status: "success" });
    expect(m.getDisburseCalls()).toHaveLength(1);
  });

  it("defaults to pending when no result configured for the key", async () => {
    const m = new MockMandiriClient();
    const r = await m.disburse({
      idempotencyKey: "k-unset",
      destBank: "BMRI", destAccount: "9999999999", destName: "X",
      amount: 1, remark: "",
    });
    expect(r.status).toBe("pending");
    expect(r.ref).toBe("MOCK-k-unset");
  });

  it("signature verification is configurable for negative tests", () => {
    const m = new MockMandiriClient();
    expect(m.verifyWebhookSignature({}, "")).toBe(true);
    m.setSignatureValid(false);
    expect(m.verifyWebhookSignature({}, "")).toBe(false);
  });
});
