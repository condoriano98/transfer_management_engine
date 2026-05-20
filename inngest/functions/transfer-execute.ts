import { inngest } from "@/inngest/client";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { xenditFromEnv } from "@/lib/adapters/xendit";

/**
 * On `transfer.approved`, call the provider (Xendit) and record a `transfers`
 * row in pending state. The Xendit webhook later settles it.
 */
export const transferExecute = inngest.createFunction(
  { id: "transfer.execute", retries: 3 },
  { event: "transfer.approved" },
  async ({ event, step }) => {
    const { request_id, org_id } = event.data;
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

    const provider = await step.run("call-provider", async () => {
      const client = xenditFromEnv();
      return client.createDisbursement({
        external_id: req.id,
        amount: req.amount,
        currency: req.currency,
        description: req.purpose ?? `Transfer ${req.id}`,
      });
    });

    await step.run("record-transfer", async () => {
      await sb.from("transfers").insert({
        request_id: req.id,
        org_id,
        provider: "xendit",
        provider_ref: provider.id,
        status: "pending",
        executed_at: new Date().toISOString(),
      });
      await sb
        .from("transfer_requests")
        .update({ status: "executing" })
        .eq("id", req.id);
    });

    return { provider_ref: provider.id };
  },
);
