import { supabaseServer } from "@/lib/db/supabase-server";
import { SpendAnalytics } from "./spend-analytics";

export default async function AnalyticsPage() {
  const sb = await supabaseServer();

  const { data: transfers } = await sb
    .from("transfers")
    .select(`
      id,
      status,
      provider,
      executed_at,
      settled_at,
      transfer_requests!inner(amount, currency, to_account_id, accounts!inner(code, name))
    `)
    .eq("status", "success")
    .order("settled_at", { ascending: false })
    .limit(500);

  const { data: balances } = await sb
    .from("account_balances")
    .select("code,name,balance,currency")
    .in("type", ["expense"]);

  const normalizedTransfers = (transfers ?? []).map((t: any) => ({
    ...t,
    transfer_requests: Array.isArray(t.transfer_requests)
      ? t.transfer_requests[0]
      : t.transfer_requests,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Spend Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ad platform spend breakdown and trends.
      </p>
      <SpendAnalytics
        transfers={normalizedTransfers}
        expenseBalances={balances ?? []}
      />
    </div>
  );
}
