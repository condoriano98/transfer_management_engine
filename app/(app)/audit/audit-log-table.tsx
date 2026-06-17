"use client";

import { useState, useMemo } from "react";

type AuditLog = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

const ENTITY_TYPES = [
  "all",
  "transfer_requests",
  "approvals",
  "transfers",
  "accounts",
  "approval_rules",
  "memberships",
  "orgs",
];

export function AuditLogTable({ initialLogs }: { initialLogs: AuditLog[] }) {
  const [entityFilter, setEntityFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    let logs = initialLogs;
    if (entityFilter !== "all") {
      logs = logs.filter((l) => l.entity_type === entityFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.action.toLowerCase().includes(term) ||
          l.entity_type.toLowerCase().includes(term) ||
          l.entity_id?.toLowerCase().includes(term) ||
          l.actor_id?.toLowerCase().includes(term)
      );
    }
    return logs;
  }, [initialLogs, entityFilter, searchTerm]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All entities" : t.replace("_", " ")}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search action, entity, actor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm flex-1 max-w-xs"
        />
        <span className="text-xs text-muted-foreground">
          {filtered.length} entries
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Time</th>
              <th className="px-4 py-2 text-left font-medium">Entity</th>
              <th className="px-4 py-2 text-left font-medium">Action</th>
              <th className="px-4 py-2 text-left font-medium">Entity ID</th>
              <th className="px-4 py-2 text-left font-medium">Actor</th>
              <th className="px-4 py-2 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No audit entries found.
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-mono">
                      {log.entity_type}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <ActionBadge action={log.action} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {log.entity_id?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {log.actor_id?.slice(0, 8) ?? "system"}
                  </td>
                  <td className="px-4 py-2">
                    <DiffCell before={log.before} after={log.after} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  let color = "bg-muted text-foreground";
  if (action === "created") color = "bg-green-100 text-green-800";
  else if (action === "deleted") color = "bg-red-100 text-red-800";
  else if (action.includes("→")) color = "bg-blue-100 text-blue-800";
  else if (action === "updated") color = "bg-yellow-100 text-yellow-800";

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {action}
    </span>
  );
}

function DiffCell({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!before && !after) return <span className="text-muted-foreground">—</span>;

  const changes: string[] = [];
  if (before && after) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      if (key === "updated_at" || key === "created_at") continue;
      const bVal = JSON.stringify(before[key]);
      const aVal = JSON.stringify(after[key]);
      if (bVal !== aVal) {
        changes.push(`${key}: ${before[key] ?? "∅"} → ${after[key] ?? "∅"}`);
      }
    }
  }

  if (changes.length === 0 && !before && after) {
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:underline"
      >
        {expanded ? "hide" : "view"}
      </button>
    );
  }

  return (
    <div className="max-w-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:underline"
      >
        {expanded ? "hide" : `${changes.length} change${changes.length !== 1 ? "s" : ""}`}
      </button>
      {expanded && (
        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">
          {changes.length > 0
            ? changes.join("\n")
            : JSON.stringify(after ?? before, null, 2)}
        </pre>
      )}
    </div>
  );
}
