import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db/supabase-server";

const ALLOWED = new Set([
  "journals",
  "ledger_entries",
  "transfer_requests",
  "transfers",
  "approvals",
  "audit_log",
]);

/**
 * Stream CSV/JSON export. RLS scopes rows to the caller's orgs automatically.
 * We page through the table 1000 rows at a time to avoid buffering everything.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const entity = url.searchParams.get("entity") ?? "";
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!ALLOWED.has(entity)) {
    return NextResponse.json({ error: "invalid entity" }, { status: 400 });
  }

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const PAGE = 1000;
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let offset = 0;
      let firstChunk = true;
      let headers: string[] = [];

      while (true) {
        let q = sb.from(entity).select("*").range(offset, offset + PAGE - 1);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);
        const { data, error } = await q;
        if (error) {
          controller.error(error);
          return;
        }
        if (!data || data.length === 0) break;

        if (format === "json") {
          if (firstChunk) controller.enqueue(enc.encode("["));
          for (let i = 0; i < data.length; i++) {
            const sep = firstChunk && i === 0 ? "" : ",";
            controller.enqueue(enc.encode(sep + JSON.stringify(data[i])));
          }
        } else {
          if (firstChunk) {
            headers = Object.keys(data[0]);
            controller.enqueue(enc.encode(headers.join(",") + "\n"));
          }
          for (const row of data) {
            const line = headers
              .map((h) => {
                const v = (row as Record<string, unknown>)[h];
                if (v == null) return "";
                const s = typeof v === "string" ? v : JSON.stringify(v);
                return `"${s.replace(/"/g, '""')}"`;
              })
              .join(",");
            controller.enqueue(enc.encode(line + "\n"));
          }
        }
        firstChunk = false;
        offset += PAGE;
        if (data.length < PAGE) break;
      }

      if (format === "json") {
        const enc2 = new TextEncoder();
        controller.enqueue(enc2.encode(firstChunk ? "[]" : "]"));
      }
      controller.close();
    },
  });

  const filename = `${entity}-${new Date().toISOString().slice(0, 10)}.${format}`;
  return new Response(stream, {
    headers: {
      "Content-Type":
        format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
