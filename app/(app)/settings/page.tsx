import { supabaseServer } from "@/lib/db/supabase-server";

export default async function SettingsPage() {
  const sb = await supabaseServer();
  const memberships = (await sb
    .from("memberships")
    .select("role,orgs(id,name,slug)")).data as unknown as Array<{
      role: string;
      orgs: { id: string; name: string; slug: string } | null;
    }> | null;

  const rules = (await sb
    .from("approval_rules")
    .select(
      "id,threshold,approver_role,to_account_id,accounts:to_account_id(code,name)",
    )).data as unknown as Array<{
      id: string;
      threshold: number;
      approver_role: string;
      accounts: { code: string; name: string } | null;
    }> | null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <h2 className="mt-8 text-lg font-medium">Organizations</h2>
      <ul className="mt-2 divide-y divide-border rounded border border-border text-sm">
        {(memberships ?? []).map((m) =>
          m.orgs ? (
            <li key={m.orgs.id} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">{m.orgs.name}</div>
                <div className="text-xs text-muted-foreground">{m.orgs.slug}</div>
              </div>
              <span className="text-xs uppercase">{m.role}</span>
            </li>
          ) : null,
        )}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Approval rules</h2>
      <ul className="mt-2 divide-y divide-border rounded border border-border text-sm">
        {(rules ?? []).length === 0 ? (
          <li className="p-3 text-muted-foreground">No rules configured.</li>
        ) : (
          (rules ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between p-3">
              <span>
                {r.accounts ? `${r.accounts.code}` : "any account"}
                {" "} · ≥ {(r.threshold / 100).toLocaleString()}
              </span>
              <span className="text-xs uppercase">{r.approver_role}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
