import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/db/supabase-server";

export default async function TransferDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: req } = await sb
    .from("transfer_requests")
    .select("id,org_id,amount,currency,status,purpose,created_at,from_account_id,to_account_id")
    .eq("id", id)
    .maybeSingle();
  if (!req) notFound();

  const { data: approvals } = await sb
    .from("approvals")
    .select("decision,notes,decided_at,channel")
    .eq("request_id", id)
    .order("decided_at", { ascending: false });

  const { data: transfers } = await sb
    .from("transfers")
    .select("provider,provider_ref,status,executed_at,settled_at,failure_reason")
    .eq("request_id", id);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Transfer {req.id.slice(0, 8)}</h1>
      <dl className="mt-6 grid grid-cols-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd className="col-span-2">{req.status}</dd>
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="col-span-2 tabular-nums">
          {req.currency} {(req.amount / 100).toLocaleString()}
        </dd>
        <dt className="text-muted-foreground">Purpose</dt>
        <dd className="col-span-2">{req.purpose ?? "—"}</dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd className="col-span-2">{new Date(req.created_at).toLocaleString()}</dd>
      </dl>

      <h2 className="mt-8 text-lg font-medium">Approvals</h2>
      <ul className="mt-2 divide-y divide-border rounded border border-border text-sm">
        {(approvals ?? []).length === 0 ? (
          <li className="p-3 text-muted-foreground">None yet.</li>
        ) : (
          approvals!.map((a, i) => (
            <li key={i} className="flex items-center justify-between p-3">
              <span>{a.decision}</span>
              <span className="text-muted-foreground">{a.channel}</span>
              <span className="text-muted-foreground">
                {new Date(a.decided_at).toLocaleString()}
              </span>
            </li>
          ))
        )}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Provider transfers</h2>
      <ul className="mt-2 divide-y divide-border rounded border border-border text-sm">
        {(transfers ?? []).length === 0 ? (
          <li className="p-3 text-muted-foreground">No provider call yet.</li>
        ) : (
          transfers!.map((t, i) => (
            <li key={i} className="p-3">
              <div>{t.provider} · {t.status}</div>
              {t.provider_ref && (
                <div className="font-mono text-xs text-muted-foreground">{t.provider_ref}</div>
              )}
              {t.failure_reason && (
                <div className="text-red-600">{t.failure_reason}</div>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
