import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { postJournal } from "@/lib/ledger/post";

/**
 * Xendit disbursement webhook. Verifies the shared token, then settles the
 * matching transfer by posting a balancing journal and updating status.
 */
export async function POST(req: Request) {
  const token = req.headers.get("x-callback-token");
  if (!token || token !== process.env.XENDIT_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as
    | { external_id?: string; id?: string; status?: string; failure_reason?: string }
    | null;
  if (!body?.external_id) {
    return NextResponse.json({ error: "missing external_id" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: reqRow, error: reqErr } = await sb
    .from("transfer_requests")
    .select(
      "id,org_id,amount,currency,status,from_account_id,to_account_id",
    )
    .eq("id", body.external_id)
    .single();
  if (reqErr || !reqRow) {
    return NextResponse.json({ error: "request not found" }, { status: 404 });
  }

  if (body.status === "COMPLETED") {
    const { data: fromAcc } = await sb
      .from("accounts").select("code").eq("id", reqRow.from_account_id).single();
    const { data: toAcc } = await sb
      .from("accounts").select("code").eq("id", reqRow.to_account_id).single();
    if (!fromAcc || !toAcc) {
      return NextResponse.json({ error: "account not found" }, { status: 500 });
    }

    const journalId = await postJournal(sb, {
      org_id: reqRow.org_id,
      memo: `xendit disbursement ${body.id ?? ""}`.trim(),
      ref: `transfer:${reqRow.id}`,
      lines: [
        { account_code: toAcc.code,   direction: "debit",  amount: reqRow.amount, currency: reqRow.currency },
        { account_code: fromAcc.code, direction: "credit", amount: reqRow.amount, currency: reqRow.currency },
      ],
    });

    await sb
      .from("transfers")
      .update({
        status: "success",
        journal_id: journalId,
        settled_at: new Date().toISOString(),
      })
      .eq("request_id", reqRow.id);

    await sb
      .from("transfer_requests")
      .update({ status: "settled" })
      .eq("id", reqRow.id);
  } else if (body.status === "FAILED") {
    await sb
      .from("transfers")
      .update({ status: "failed", failure_reason: body.failure_reason ?? null })
      .eq("request_id", reqRow.id);
    await sb
      .from("transfer_requests")
      .update({ status: "failed" })
      .eq("id", reqRow.id);
  }

  return NextResponse.json({ ok: true });
}
