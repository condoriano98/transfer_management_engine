import { inngest } from "@/inngest/client";
import { supabaseAdmin } from "@/lib/db/supabase-server";

export const autoApprove = inngest.createFunction(
  { id: "transfer.auto-approve", retries: 2 },
  { event: "transfer.requested" },
  async ({ event, step }) => {
    const { request_id, org_id } = event.data;
    const sb = supabaseAdmin();

    const req = await step.run("load-request", async () => {
      const { data, error } = await sb
        .from("transfer_requests")
        .select("id,org_id,amount,to_account_id,status")
        .eq("id", request_id)
        .single();
      if (error) throw error;
      return data;
    });

    if (req.status !== "pending") {
      return { skipped: true, reason: "not pending" };
    }

    const rule = await step.run("check-auto-approve-rule", async () => {
      const { data: rules } = await sb
        .from("approval_rules")
        .select("id,auto_approve_threshold,to_account_id")
        .eq("org_id", org_id)
        .lte("threshold", req.amount)
        .order("threshold", { ascending: false });

      if (!rules || rules.length === 0) return null;

      const match =
        rules.find((r) => r.to_account_id === req.to_account_id) ??
        rules.find((r) => r.to_account_id === null);

      return match;
    });

    if (!rule || rule.auto_approve_threshold <= 0 || req.amount > rule.auto_approve_threshold) {
      return { skipped: true, reason: "above threshold or no rule" };
    }

    await step.run("auto-approve", async () => {
      await sb.from("approvals").insert({
        request_id: req.id,
        org_id: req.org_id,
        approver_id: null,
        decision: "approve",
        notes: `Auto-approved: ${req.amount} <= threshold ${rule.auto_approve_threshold}`,
        channel: "system",
      });

      await sb
        .from("transfer_requests")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", req.id);
    });

    await step.run("fire-approved-event", async () => {
      await inngest.send({
        name: "transfer.approved",
        data: {
          request_id: req.id,
          org_id: req.org_id,
          idempotency_key: `transfer_approved:${req.id}`,
        },
      });
    });

    return { auto_approved: true, threshold: rule.auto_approve_threshold };
  },
);
