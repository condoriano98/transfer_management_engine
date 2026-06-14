import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/rbac";

export type ApprovalRule = {
  id: string;
  to_account_id: string | null;
  threshold: number;
  approver_role: Role;
  required_approver_count: number;
};

type ApprovalRuleRow = {
  id: string;
  to_account_id: string | null;
  threshold: number;
  approver_role: Role;
  required_approver_count: number;
};

async function loadRules(
  sb: SupabaseClient,
  orgId: string,
  amount: number,
): Promise<ApprovalRuleRow[]> {
  const { data, error } = await sb
    .from("approval_rules")
    .select("id,to_account_id,threshold,approver_role,required_approver_count")
    .eq("org_id", orgId)
    .lte("threshold", amount)
    .order("threshold", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApprovalRuleRow[];
}

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
  const rules = await loadRules(sb, orgId, amount);
  const match =
    rules.find((r) => r.to_account_id === toAccountId) ??
    rules.find((r) => r.to_account_id === null);
  return match?.approver_role ?? null;
}

/**
 * Returns the full matching approval rule (including required_approver_count)
 * so callers can enforce tiered / multi-approver thresholds.
 */
export async function getApprovalRule(
  sb: SupabaseClient,
  orgId: string,
  toAccountId: string,
  amount: number,
): Promise<ApprovalRule | null> {
  const rules = await loadRules(sb, orgId, amount);
  const match =
    rules.find((r) => r.to_account_id === toAccountId) ??
    rules.find((r) => r.to_account_id === null);
  return match ?? null;
}
