import { inngest } from "@/inngest/client";
import { supabaseAdmin } from "@/lib/db/supabase-server";

/**
 * On `transfer.approved`, record the allocation and transition to "executing".
 *
 * "executing" means the transfer has been approved and the funds are allocated
 * for tracking. Settlement is handled separately via:
 *   - Manual settle: admin/finance calls settleTransfer() server action
 *   - Automated: ad-platform sync workers reconcile actual spend and post
 *     settlement journals (planned Phase 8)
 *
 * If a payment gateway is configured (XENDIT_API_KEY), it runs as an optional
 * adapter. Without one, the transfer is tracked as an internal allocation.
 *
 * Idempotency: checks for an existing transfers row before inserting. The
 * UNIQUE (request_id, provider) constraint on transfers is the safety net.
 */
export const transferExecute = inngest.createFunction(
  { id: "transfer.execute", retries: 3 },
  { event: "transfer.approved" },
  async ({ event, step }) => {
    const { request_id, org_id, idempotency_key } = event.data;
    const sb = supabaseAdmin();

    const req = await step.run("load-request", async () => {
      const { data, error } = await sb
        .from("transfer_requests")
        .select("id,org_id,amount,currency,from_account_id,to_account_id,purpose")
        .eq("id", request_id)
        .single();
      if (error) throw error;
      return data;
    });

    let provider = "internal";
    let providerRef: string | null = null;

    const xenditKey = process.env.XENDIT_API_KEY;
    if (xenditKey) {
      const result = await step.run("call-provider", async () => {
        const { xenditFromEnv } = await import("@/lib/adapters/xendit");
        const client = xenditFromEnv();
        return client.createDisbursement({
          external_id: req.id,
          amount: req.amount,
          currency: req.currency,
          description: req.purpose ?? `Transfer ${req.id}`,
        });
      });
      provider = "xendit";
      providerRef = result.id;
    }

    const recorded = await step.run("record-allocation", async () => {
      const { data: existing } = await sb
        .from("transfers")
        .select("id,provider_ref,status")
        .eq("request_id", req.id)
        .eq("provider", provider)
        .maybeSingle();

      if (existing) {
        return { duplicate: true, ...existing };
      }

      const { data: inserted, error: insErr } = await sb
        .from("transfers")
        .insert({
          request_id: req.id,
          org_id,
          provider,
          provider_ref: providerRef,
          status: "pending",
          executed_at: new Date().toISOString(),
        })
        .select("id,provider_ref")
        .single();

      if (insErr) throw insErr;

      await sb
        .from("transfer_requests")
        .update({ status: "executing" })
        .eq("id", req.id);

      return { duplicate: false, ...inserted };
    });

    // Record event delivery for application-level idempotency audit.
    await step.run("record-event-delivery", async () => {
      await sb.from("event_deliveries").upsert(
        {
          idempotency_key,
          event_name: "transfer.approved",
          payload: { request_id, org_id } as Record<string, unknown>,
        },
        { onConflict: "idempotency_key" },
      );
    });

    return {
      provider,
      provider_ref: recorded.provider_ref ?? providerRef,
      duplicate: recorded.duplicate,
    };
  },
);
