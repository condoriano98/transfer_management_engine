import { inngest } from "@/inngest/client";
import { supabaseAdmin } from "@/lib/db/supabase-server";

/**
 * Daily reconciliation: match Mandiri statement lines to pool events, compute
 * drift between bank EOD balance and ledger totals, and enqueue exceptions.
 *
 * Runs via Inngest cron at 02:00 UTC daily (after bank statement ingestion).
 */
export const reconcileDaily = inngest.createFunction(
  {
    id: "reconcile.daily",
    retries: 2,
  },
  { cron: "TZ=Asia/Jakarta 0 2 * * *" },
  async ({ step }) => {
    const sb = supabaseAdmin();

    // -------- 1. Match statement lines to pool events --------
    const matched = await step.run("match-statements", async () => {
      const { data: unmatched } = await sb
        .from("mandiri_statement_lines")
        .select("statement_date,line_no,reference_code,debit,credit")
        .is("matched_event_id", null)
        .order("statement_date")
        .order("line_no");

      if (!unmatched?.length) return { lines: 0, matched: 0 };

      const { data: events } = await sb
        .from("pool_events")
        .select("id,external_ref,event_type,amount")
        .in("event_type", ["credit_inbound", "debit_outbound"]);

      let matchedCount = 0;
      for (const line of unmatched) {
        if (!line.reference_code) continue;
        const event = (events ?? []).find(
          (e) =>
            e.external_ref === line.reference_code &&
            (line.credit > 0 ? e.event_type === "credit_inbound" : e.event_type === "debit_outbound"),
        );
        if (event) {
          await sb
            .from("mandiri_statement_lines")
            .update({
              matched_event_id: event.id,
              matched_at: new Date().toISOString(),
            })
            .eq("statement_date", line.statement_date)
            .eq("line_no", line.line_no);
          matchedCount++;
        }
      }

      return { lines: unmatched.length, matched: matchedCount };
    });

    // -------- 2. Compute drift snapshot --------
    const drift = await step.run("compute-drift", async () => {
      const today = new Date().toISOString().slice(0, 10);

      const { data: mandiriLine } = await sb
        .from("mandiri_statement_lines")
        .select("running_balance")
        .eq("statement_date", today)
        .order("line_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: poolTotal } = await sb
        .from("account_balances")
        .select("balance")
        .eq("code", "pool")
        .maybeSingle();

      const { data: inTransit } = await sb
        .from("account_balances")
        .select("balance")
        .eq("code", "pending_transfers")
        .maybeSingle();

      // Count unmatched lines for today
      const { count: unmatchedCount } = await sb
        .from("mandiri_statement_lines")
        .select("*", { count: "exact", head: true })
        .is("matched_event_id", null)
        .eq("statement_date", today)
        .neq("description", "SALDO AWAL");

      const mandiriEod = mandiriLine?.running_balance ?? 0;
      const ledgerPool = Number(poolTotal?.balance ?? 0);
      const transit = Number(inTransit?.balance ?? 0);

      await sb.from("recon_runs").upsert({
        run_date: today,
        mandiri_eod_balance: mandiriEod,
        ledger_pool_total: ledgerPool,
        in_transit_total: transit,
        unmatched_lines: unmatchedCount ?? 0,
        status: "clean",
        notes: "auto-recon",
      });

      return {
        mandiri_eod_balance: mandiriEod,
        ledger_pool_total: ledgerPool,
        in_transit_total: transit,
        drift: mandiriEod - ledgerPool - transit,
      };
    });

    // -------- 3. Enqueue exceptions for unmatched lines --------
    await step.run("enqueue-exceptions", async () => {
      const { data: unmatched } = await sb
        .from("mandiri_statement_lines")
        .select("statement_date,line_no,reference_code,debit,credit,description")
        .is("matched_event_id", null)
        .neq("description", "SALDO AWAL")
        .gt("statement_date", new Date(Date.now() - 48 * 3600 * 1000).toISOString().slice(0, 10));

      if (!unmatched?.length) return { enqueued: 0 };

      for (const line of unmatched) {
        const amount = line.credit > 0 ? line.credit : line.debit;
        if (amount === 0) continue;

        const dedupKey = `${line.statement_date}_${line.line_no}`;
        const { data: existing } = await sb
          .from("exception_queue")
          .select("id")
          .eq("event_type", "unmatched_statement")
          .eq("org_id", "00000000-0000-0000-0000-000000000000")
          .eq("payload->>reference_code", line.reference_code ?? dedupKey)
          .maybeSingle();

        if (!existing) {
          await sb.from("exception_queue").insert({
            org_id: "00000000-0000-0000-0000-000000000000",
            event_type: "unmatched_statement",
            payload: {
              statement_date: line.statement_date,
              line_no: line.line_no,
              reference_code: line.reference_code,
              amount,
              description: line.description,
            } as Record<string, unknown>,
            status: "pending",
          });
        }
      }

      return { enqueued: unmatched.length };
    });

    return {
      matched_lines: matched.matched,
      unmatched_lines: matched.lines - matched.matched,
      drift: drift.drift,
    };
  },
);
