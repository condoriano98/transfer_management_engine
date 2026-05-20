import { describe, it, expect } from "vitest";
import { JournalInput, postJournal } from "@/lib/ledger/post";

describe("postJournal validation (offline)", () => {
  it("rejects unbalanced journals before hitting the DB", async () => {
    const fakeSb = {
      rpc: () => Promise.resolve({ data: "should-not-reach", error: null }),
    } as never;

    await expect(
      postJournal(fakeSb, {
        org_id: "00000000-0000-0000-0000-000000000000",
        memo: "bad",
        lines: [
          { account_code: "pool", direction: "debit",  amount: 100, currency: "IDR" },
          { account_code: "meta_ads", direction: "credit", amount: 50, currency: "IDR" },
        ],
      }),
    ).rejects.toThrow(/unbalanced/);
  });

  it("requires at least 2 lines", () => {
    expect(() =>
      JournalInput.parse({
        org_id: "00000000-0000-0000-0000-000000000000",
        memo: "x",
        lines: [{ account_code: "pool", direction: "debit", amount: 1, currency: "IDR" }],
      }),
    ).toThrow();
  });

  it("accepts a balanced 2-line journal", () => {
    const ok = JournalInput.parse({
      org_id: "00000000-0000-0000-0000-000000000000",
      memo: "ok",
      lines: [
        { account_code: "pool", direction: "debit",  amount: 100, currency: "IDR" },
        { account_code: "cash_line", direction: "credit", amount: 100, currency: "IDR" },
      ],
    });
    expect(ok.lines).toHaveLength(2);
  });
});
