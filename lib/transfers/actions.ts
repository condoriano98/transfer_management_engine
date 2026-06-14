"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/db/supabase-server";
import { requireRole, requireUser } from "@/lib/auth/rbac";
import { requiredApproverRole } from "@/lib/approvals/rules";
import { nextStatus } from "@/lib/transfers/state";
import { postJournal } from "@/lib/ledger/post";

const CreateTransferInput = z.object({
  org_id: z.string().uuid(),
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default("IDR"),
  purpose: z.string().max(1000).optional(),
});

export async function createTransferRequest(
  input: z.infer<typeof CreateTransferInput>,
) {
  const data = CreateTransferInput.parse(input);
  const user = await requireUser();
  await requireRole(data.org_id, "ads_manager");

  const sb = await supabaseServer();
  const { data: row, error } = await sb
    .from("transfer_requests")
    .insert({ ...data, requested_by: user.id })
    .select("id,status")
    .single();
  if (error) throw error;

  revalidatePath("/transfers");
  revalidatePath("/approvals");
  return row;
}

export async function decideApproval(
  requestId: string,
  decision: "approve" | "reject",
  notes?: string,
) {
  const user = await requireUser();
  const sb = await supabaseServer();

  const { data: req, error: reqErr } = await sb
    .from("transfer_requests")
    .select("id,org_id,to_account_id,amount,status")
    .eq("id", requestId)
    .single();
  if (reqErr) throw reqErr;

  const requiredRole = await requiredApproverRole(
    sb,
    req.org_id,
    req.to_account_id,
    req.amount,
  );
  if (requiredRole) await requireRole(req.org_id, requiredRole);

  const newStatus = nextStatus(req.status, { type: decision });

  // Record approval
  const { error: insErr } = await sb.from("approvals").insert({
    request_id: req.id,
    org_id: req.org_id,
    approver_id: user.id,
    decision,
    notes: notes ?? null,
    channel: "in_app",
  });
  if (insErr) throw insErr;

  const { error: updErr } = await sb
    .from("transfer_requests")
    .update({ status: newStatus })
    .eq("id", req.id);
  if (updErr) throw updErr;

  revalidatePath("/approvals");
  revalidatePath(`/transfers/${req.id}`);
  return { status: newStatus };
}

/**
 * Manual settle path — used by webhook or by an admin marking a transfer
 * settled. Posts the ledger journal and flips status.
 */
export async function settleTransfer(opts: {
  request_id: string;
  provider: string;
  provider_ref: string;
}) {
  const sb = await supabaseServer();

  const { data: req, error } = await sb
    .from("transfer_requests")
    .select("id,org_id,from_account_id,to_account_id,amount,currency,status")
    .eq("id", opts.request_id)
    .single();
  if (error) throw error;

  await requireRole(req.org_id, "finance");

  const { data: fromAcc } = await sb
    .from("accounts").select("code").eq("id", req.from_account_id).single();
  const { data: toAcc } = await sb
    .from("accounts").select("code").eq("id", req.to_account_id).single();
  if (!fromAcc || !toAcc) throw new Error("account not found");

  const journalId = await postJournal(sb, {
    org_id: req.org_id,
    memo: `transfer ${req.id}`,
    ref: `transfer:${req.id}`,
    lines: [
      { account_code: toAcc.code,   direction: "debit",  amount: req.amount, currency: req.currency },
      { account_code: fromAcc.code, direction: "credit", amount: req.amount, currency: req.currency },
    ],
  });

  const { error: tErr } = await sb.from("transfers").insert({
    request_id: req.id,
    org_id: req.org_id,
    provider: opts.provider,
    provider_ref: opts.provider_ref,
    status: "success",
    journal_id: journalId,
    executed_at: new Date().toISOString(),
    settled_at: new Date().toISOString(),
  });
  if (tErr) throw tErr;

  let current = req.status;
  if (current !== "executing") {
    current = nextStatus(current, { type: "execute" });
  }
  const newStatus = nextStatus(current, { type: "settle" });
  await sb.from("transfer_requests").update({ status: newStatus }).eq("id", req.id);

  revalidatePath("/dashboard");
  revalidatePath(`/transfers/${req.id}`);
  return { journal_id: journalId };
}
