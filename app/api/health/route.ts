import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-server";

/**
 * GET /api/health — liveness check for uptime monitors and load balancers.
 * Verifies DB connectivity. Returns 503 if the database is unreachable.
 */
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("orgs")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json(
        { status: "degraded", db: "unreachable", detail: error.message },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { status: "degraded", detail: message },
      { status: 503 },
    );
  }
}
