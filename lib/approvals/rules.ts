import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/rbac";

export type ApprovalRule = {
  id: string;
  to_account_id: string | null;
  threshold: number;
  approver_role: Role;
};

/**
 * Find the strictest rule that applies to this request:
 * matching account (or wildcard), threshold <= amount, highest threshold wins.
 * Returns null if no rule matches (= no approval needed).
 */
export async function requiredApproverRole(
  sb: SupabaseClient,
  orgId: string,
  toAccountId: string,
  amount: number,
): Promise<Role | null> {
  const { data, error } = await sb
    .from("approval_rules")
    .select("id,to_account_id,threshold,approver_role")
    .eq("org_id", orgId)
    .lte("threshold", amount)
    .order("threshold", { ascending: false });
  if (error) throw error;

  const rules = (data ?? []) as ApprovalRule[];
  const match =
    rules.find((r) => r.to_account_id === toAccountId) ??
    rules.find((r) => r.to_account_id === null);
  return match?.approver_role ?? null;
}
