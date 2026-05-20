import { describe, it, expect } from "vitest";
import { requiredApproverRole } from "@/lib/approvals/rules";

type StubResult = { data: unknown; error: null };
function stubSb(rules: Array<Record<string, unknown>>) {
  const builder = {
    _t: "",
    select() { return this; },
    eq(_col: string, _val: unknown) { return this; },
    lte(_col: string, _val: unknown) { return this; },
    order(_col: string, _opts: object): Promise<StubResult> {
      return Promise.resolve({ data: rules, error: null });
    },
  };
  return { from: (_t: string) => { builder._t = _t; return builder; } } as never;
}

describe("requiredApproverRole", () => {
  it("returns null when no rule matches", async () => {
    const sb = stubSb([]);
    const r = await requiredApproverRole(sb, "o", "a", 100);
    expect(r).toBeNull();
  });

  it("picks account-specific rule over wildcard", async () => {
    const sb = stubSb([
      { id: "1", to_account_id: null,    threshold: 0,    approver_role: "finance" },
      { id: "2", to_account_id: "acc-x", threshold: 5000, approver_role: "admin"   },
    ]);
    const r = await requiredApproverRole(sb, "o", "acc-x", 10_000);
    expect(r).toBe("admin");
  });

  it("falls back to wildcard when no account match", async () => {
    const sb = stubSb([
      { id: "1", to_account_id: null,    threshold: 0, approver_role: "finance" },
      { id: "2", to_account_id: "acc-y", threshold: 0, approver_role: "admin"   },
    ]);
    const r = await requiredApproverRole(sb, "o", "acc-x", 100);
    expect(r).toBe("finance");
  });
});
