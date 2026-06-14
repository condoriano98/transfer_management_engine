import { inngest } from "@/inngest/client";
import { supabaseAdmin } from "@/lib/db/supabase-server";

/**
 * Sweep for transfers stuck in "executing" for more than 24 hours without
 * a gateway settlement. These represent potential partial failures where the
 * provider executed but the ledger never recorded the journal.
 *
 * Runs hourly. For each orphaned transfer:
 *   - If Xendit provider & API key configured: check disbursement status
 *   - If confirmed completed: auto-settle via journal posting
 *   - If confirmed failed: update status to "failed"
 *   - If status unknown: enqueue to exception_queue for manual review
 */
export const recoverOrphaned = inngest.createFunction(
  {
    id: "recover.orphaned",
    retries: 1,
  },
  { cron: "TZ=Asia/Jakarta 0 * * * *" },
  async ({ step }) => {
    const sb = supabaseAdmin();

    const orphans = await step.run("find-orphans", async () => {
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await sb
        .from("transfer_requests")
        .select(
          "id,org_id,amount,currency,status,approved_at,from_account_id,to_account_id",
        )
        .eq("status", "executing")
        .lt("approved_at", cutoff)
        .limit(50);
      return data ?? [];
    });

    if (!orphans.length) return { reviewed: 0 };

    let autoSettled = 0;
    let markedFailed = 0;
    let enqueued = 0;

    for (const tr of orphans) {
      const { data: transferRow } = await sb
        .from("transfers")
        .select("id,provider,provider_ref,status")
        .eq("request_id", tr.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!transferRow) {
        // No transfer execution record exists — the Inngest function may
        // have failed before recording. Mark as failed so it can be retried.
        await sb
          .from("transfer_requests")
          .update({ status: "failed" })
          .eq("id", tr.id);
        markedFailed++;
        continue;
      }

      // If there's already a successful settled transfer for this request,
      // the status should have been updated — fix the inconsistency.
      if (transferRow.status === "success") {
        await sb
          .from("transfer_requests")
          .update({ status: "settled" })
          .eq("id", tr.id);
        autoSettled++;
        continue;
      }

      let resolved = false;

      // Check Xendit status if applicable
      if (transferRow.provider === "xendit" && process.env.XENDIT_API_KEY) {
        try {
          const { xenditFromEnv } = await import("@/lib/adapters/xendit");
          const client = xenditFromEnv();
          // Xendit disbursement status check — using the provider_ref as
          // the external disbursement ID.
          if (transferRow.provider_ref) {
            const status = await step.run(`check-xendit-${tr.id.slice(0, 8)}`, async () => {
              const res = await fetch(
                `https://api.xendit.co/disbursements/${transferRow.provider_ref}`,
                {
                  headers: {
                    Authorization:
                      "Basic " +
                      Buffer.from(process.env.XENDIT_API_KEY + ":").toString("base64"),
                  },
                },
              );
              if (!res.ok) return null;
              const body = (await res.json()) as { status?: string };
              return body.status ?? null;
            });

            if (status === "COMPLETED") {
              const { data: fromAcc } = await sb
                .from("accounts").select("code").eq("id", tr.from_account_id).single();
              const { data: toAcc } = await sb
                .from("accounts").select("code").eq("id", tr.to_account_id).single();

              if (fromAcc && toAcc) {
                const { postJournal } = await import("@/lib/ledger/post");
                await postJournal(sb, {
                  org_id: tr.org_id,
                  memo: `auto-settled transfer ${tr.id}`,
                  ref: `transfer:${tr.id}`,
                  lines: [
                    { account_code: toAcc.code, direction: "debit", amount: tr.amount, currency: tr.currency },
                    { account_code: fromAcc.code, direction: "credit", amount: tr.amount, currency: tr.currency },
                  ],
                });

                await sb
                  .from("transfers")
                  .update({
                    status: "success",
                    settled_at: new Date().toISOString(),
                  })
                  .eq("id", transferRow.id);

                await sb
                  .from("transfer_requests")
                  .update({ status: "settled" })
                  .eq("id", tr.id);

                autoSettled++;
                resolved = true;
              }
            } else if (status === "FAILED") {
              await sb
                .from("transfers")
                .update({ status: "failed", failure_reason: "auto-detected by recover-orphaned" })
                .eq("id", transferRow.id);
              await sb
                .from("transfer_requests")
                .update({ status: "failed" })
                .eq("id", tr.id);
              markedFailed++;
              resolved = true;
            }
          }
        } catch {
          // Provider status check failed — fall through to enqueue
        }
      }

      if (!resolved) {
        await sb
          .from("exception_queue")
          .upsert(
            {
              org_id: tr.org_id,
              event_type: "orphaned_transfer",
              payload: {
                request_id: tr.id,
                transfer_id: transferRow.id,
                provider: transferRow.provider,
                provider_ref: transferRow.provider_ref,
                amount: tr.amount,
                currency: tr.currency,
                approved_at: tr.approved_at,
              } as Record<string, unknown>,
              status: "pending",
            },
            { onConflict: "event_type,org_id,COALESCE(payload->>'request_id','')" },
          );
        enqueued++;
      }
    }

    return { reviewed: orphans.length, autoSettled, markedFailed, enqueued };
  },
);
