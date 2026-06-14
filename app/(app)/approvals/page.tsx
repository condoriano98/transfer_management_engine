import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/db/supabase-server";
import { decideApproval } from "@/lib/transfers/actions";

async function approve(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await decideApproval(id, "approve");
  revalidatePath("/approvals");
}

async function reject(formData: FormData) {
  "use server";
  await decideApproval(String(formData.get("id")), "reject");
  revalidatePath("/approvals");
}

export default async function ApprovalsPage() {
  const sb = await supabaseServer();
  const { data: rows } = await sb
    .from("transfer_requests")
    .select("id,amount,currency,purpose,created_at,requested_by")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
        {(rows ?? []).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">Inbox is empty.</li>
        ) : (
          rows!.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <div className="font-mono text-xs">{r.id.slice(0, 8)}</div>
                <div className="text-muted-foreground">{r.purpose ?? "—"}</div>
              </div>
              <div className="tabular-nums">
                {r.currency} {(r.amount / 100).toLocaleString()}
              </div>
              <div className="flex gap-2">
                <form action={approve}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded bg-emerald-600 px-3 py-1.5 text-white">
                    Approve
                  </button>
                </form>
                <form action={reject}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded border border-border px-3 py-1.5">
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
