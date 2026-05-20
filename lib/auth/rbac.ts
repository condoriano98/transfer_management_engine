import { supabaseServer } from "@/lib/db/supabase-server";

export type Role = "admin" | "finance" | "ads_manager" | "viewer";

const ORDER: Record<Role, number> = {
  viewer: 0,
  ads_manager: 1,
  finance: 2,
  admin: 3,
};

export function hasRole(actual: Role | null, required: Role): boolean {
  if (!actual) return false;
  return ORDER[actual] >= ORDER[required];
}

export async function requireUser() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function getMembership(orgId: string) {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role ?? null) as Role | null;
}

export async function requireRole(orgId: string, required: Role) {
  const role = await getMembership(orgId);
  if (!hasRole(role, required)) {
    throw new Error(`FORBIDDEN: need ${required}, have ${role ?? "none"}`);
  }
  return role!;
}
