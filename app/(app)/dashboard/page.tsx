import { supabaseServer } from "@/lib/db/supabase-server";
import { RealtimeDashboard } from "./realtime-dashboard";

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
    <RealtimeDashboard
      initialBalances={balances ?? []}
      initialPending={pending ?? []}
    />
  );
}
