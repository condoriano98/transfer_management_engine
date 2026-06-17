import { supabaseServer } from "@/lib/db/supabase-server";
import { AuditLogTable } from "./audit-log-table";

export default async function AuditPage() {
  const sb = await supabaseServer();

  const { data: logs } = await sb
    .from("audit_log")
    .select("id,actor_id,action,entity_type,entity_id,before,after,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit Log</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Complete history of all changes across transfers, approvals, accounts, and membership.
      </p>
      <AuditLogTable initialLogs={logs ?? []} />
    </div>
  );
}
