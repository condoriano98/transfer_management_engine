"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/db/supabase-server";
import { requireRole, requireUser } from "@/lib/auth/rbac";
import { getApprovalRule } from "@/lib/approvals/rules";
import { inngest } from "@/inngest/client";

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

  await inngest.send({
    name: "transfer.requested",
    data: {
      request_id: row.id,
      org_id: data.org_id,
      idempotency_key: `transfer_requested:${row.id}`,
    },
  });

  revalidatePath("/transfers");
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
    .select("id,org_id,to_account_id,amount,status,requested_by")
    .eq("id", requestId)
    .single();
  if (reqErr) throw reqErr;

  const rule = await getApprovalRule(
    sb,
    req.org_id,
    req.to_account_id,
    req.amount,
  );
  if (rule) await requireRole(req.org_id, rule.approver_role);

  const requiredCount = rule?.required_approver_count ?? 1;

  const { data, error } = await sb.rpc("decide_approval_atomic", {
    p_request_id: requestId,
    p_approver_id: user.id,
    p_decision: decision,
    p_notes: notes ?? null,
    p_required_count: requiredCount,
  });
  if (error) throw error;

  const result = data as { status: string; transitioned: boolean };

  if (result.transitioned && result.status === "approved") {
    await inngest.send({
      name: "transfer.approved",
      data: {
        request_id: requestId,
        org_id: req.org_id,
        idempotency_key: `transfer_approved:${requestId}`,
      },
    });
  }

  revalidatePath("/approvals");
  revalidatePath(`/transfers/${requestId}`);
  return { status: result.status };
}

export async function settleTransfer(opts: {
  request_id: string;
  provider: string;
  provider_ref: string;
}) {
  const sb = await supabaseServer();

  const { data: req, error } = await sb
    .from("transfer_requests")
    .select("id,org_id,status")
    .eq("id", opts.request_id)
    .single();
  if (error) throw error;

  await requireRole(req.org_id, "finance");

  const { data, error: rpcErr } = await sb.rpc("settle_transfer_atomic", {
    p_request_id: opts.request_id,
    p_provider: opts.provider,
    p_provider_ref: opts.provider_ref,
  });
  if (rpcErr) throw rpcErr;

  const result = data as { journal_id?: string; status?: string; already_settled?: boolean };

  revalidatePath("/dashboard");
  revalidatePath(`/transfers/${opts.request_id}`);

  if (result.already_settled) {
    return { already_settled: true, status: result.status };
  }

  return { journal_id: result.journal_id };
}
