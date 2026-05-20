import { supabaseServer } from "@/lib/db/supabase-server";

function fmt(n: number, currency = "IDR") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n / 100);
}

export default async function DashboardPage() {
  const sb = await supabaseServer();

  const { data: balances } = await sb
    .from("account_balances")
    .select("code,name,type,currency,balance")
    .order("code");

  const { data: pending } = await sb
    .from("transfer_requests")
    .select("id,amount,currency,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {(balances ?? []).map((a) => (
          <div key={a.code} className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase text-muted-foreground">{a.type}</div>
            <div className="mt-1 text-sm font-medium">{a.name}</div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">
              {fmt(Number(a.balance ?? 0), a.currency ?? "IDR")}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Pending approvals</h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {(pending ?? []).length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">Nothing pending.</li>
          ) : (
            pending!.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-4 text-sm">
                <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                <span className="tabular-nums">{fmt(r.amount, r.currency)}</span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
