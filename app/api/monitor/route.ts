import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-server";

/**
 * GET /api/monitor — operational snapshot for on-call dashboards.
 * Returns pending transfer count, stuck executing count, orphaned
 * transfers in the exception queue, recon drift stats, and webhook
 * configuration health. All queries use supabaseAdmin for cross-org
 * visibility.
 */
export async function GET() {
  try {
    const sb = supabaseAdmin();

    // -------- Transfer pipeline health --------
    const pendingPromise = sb
      .from("transfer_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const stuckPromise = sb
      .from("transfer_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "executing")
      .lt("approved_at", cutoff);

    // -------- Exception queue --------
    const orphanedPromise = sb
      .from("exception_queue")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "orphaned_transfer")
      .eq("status", "pending");

    const driftPromise = sb
      .from("exception_queue")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "recon_drift")
      .eq("status", "pending");

    // -------- Latest reconciliation --------
    const reconPromise = sb
      .from("recon_runs")
      .select("run_date,status,drift")
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [
      { count: pendingCount },
      { count: stuckCount },
      { count: orphanedCount },
      { count: driftCount },
      { data: latestRecon },
    ] = await Promise.all([
      pendingPromise,
      stuckPromise,
      orphanedPromise,
      driftPromise,
      reconPromise,
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      transfers: {
        pending: pendingCount ?? 0,
        stuck_executing_24h: stuckCount ?? 0,
      },
      exceptions: {
        orphaned_transfers: orphanedCount ?? 0,
        recon_drift: driftCount ?? 0,
      },
      reconciliation: latestRecon
        ? {
            date: latestRecon.run_date,
            status: latestRecon.status,
            drift: latestRecon.drift,
          }
        : null,
      webhooks: {
        xendit: Boolean(process.env.XENDIT_API_KEY),
        mandiri: false,
        slack: Boolean(process.env.SLACK_WEBHOOK_URL),
        teams: Boolean(process.env.TEAMS_WEBHOOK_URL),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
