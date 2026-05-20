import Link from "next/link";
import { supabaseServer } from "@/lib/db/supabase-server";

export default async function TransfersPage() {
  const sb = await supabaseServer();
  const { data: rows } = await sb
    .from("transfer_requests")
    .select("id,amount,currency,status,created_at,purpose")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transfers</h1>
        <Link
          href="/transfers/new"
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          New transfer
        </Link>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">ID</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Purpose</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td className="py-2 font-mono text-xs">
                <Link href={`/transfers/${r.id}`} className="hover:underline">
                  {r.id.slice(0, 8)}
                </Link>
              </td>
              <td className="tabular-nums">
                {r.currency} {(r.amount / 100).toLocaleString()}
              </td>
              <td>{r.status}</td>
              <td className="text-muted-foreground">{r.purpose ?? "—"}</td>
              <td className="text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
