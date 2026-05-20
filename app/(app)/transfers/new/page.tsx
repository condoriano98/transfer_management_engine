import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/db/supabase-server";
import { createTransferRequest } from "@/lib/transfers/actions";
import { inngest } from "@/inngest/client";

async function submit(formData: FormData) {
  "use server";
  const org_id = String(formData.get("org_id"));
  const from_account_id = String(formData.get("from_account_id"));
  const to_account_id = String(formData.get("to_account_id"));
  const amount = Math.round(Number(formData.get("amount")) * 100);
  const currency = String(formData.get("currency") ?? "IDR");
  const purpose = String(formData.get("purpose") ?? "");

  const req = await createTransferRequest({
    org_id, from_account_id, to_account_id, amount, currency, purpose,
  });

  await inngest.send({
    name: "transfer.requested",
    data: { request_id: req.id, org_id },
  });

  redirect(`/transfers/${req.id}`);
}

export default async function NewTransferPage() {
  const sb = await supabaseServer();
  const { data: memberships } = await sb
    .from("memberships")
    .select("org_id,orgs(id,name)");
  const orgId = memberships?.[0]?.org_id;

  const { data: accounts } = await sb
    .from("accounts")
    .select("id,code,name,type")
    .eq("org_id", orgId ?? "")
    .order("code");

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">New transfer</h1>
      <form action={submit} className="mt-6 grid gap-4 text-sm">
        <input type="hidden" name="org_id" value={orgId ?? ""} />
        <label className="grid gap-1">
          <span>From account</span>
          <select name="from_account_id" required className="rounded border border-border px-3 py-2">
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span>To account</span>
          <select name="to_account_id" required className="rounded border border-border px-3 py-2">
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span>Amount</span>
          <input
            type="number" name="amount" required min="0.01" step="0.01"
            className="rounded border border-border px-3 py-2"
          />
        </label>
        <label className="grid gap-1">
          <span>Currency</span>
          <input
            type="text" name="currency" defaultValue="IDR" maxLength={3}
            className="rounded border border-border px-3 py-2"
          />
        </label>
        <label className="grid gap-1">
          <span>Purpose</span>
          <textarea name="purpose" rows={3} className="rounded border border-border px-3 py-2" />
        </label>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Submit for approval
        </button>
      </form>
    </div>
  );
}
