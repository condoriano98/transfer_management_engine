import { supabaseServer } from "@/lib/db/supabase-server";

export default async function LedgerPage() {
  const sb = await supabaseServer();
  const { data: entries } = await sb
    .from("ledger_entries")
    .select(
      "id,direction,amount,currency,created_at,accounts(code,name),journals(memo,ref)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = {
    id: number;
    direction: "debit" | "credit";
    amount: number;
    currency: string;
    created_at: string;
    accounts: { code: string; name: string } | null;
    journals: { memo: string; ref: string | null } | null;
  };

  const rows = (entries ?? []) as unknown as Row[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Ledger</h1>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">When</th>
            <th>Account</th>
            <th>Dir</th>
            <th className="text-right">Amount</th>
            <th>Memo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="py-2 text-muted-foreground">
                {new Date(e.created_at).toLocaleString()}
              </td>
              <td>
                <span className="font-mono text-xs">{e.accounts?.code}</span>{" "}
                {e.accounts?.name}
              </td>
              <td>{e.direction}</td>
              <td className="text-right tabular-nums">
                {e.currency} {(e.amount / 100).toLocaleString()}
              </td>
              <td className="text-muted-foreground">{e.journals?.memo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
