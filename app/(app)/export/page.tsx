const ENTITIES = [
  "journals",
  "ledger_entries",
  "transfer_requests",
  "transfers",
  "approvals",
  "audit_log",
] as const;

export default function ExportPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Export raw data</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Streams CSV or JSON for any table you can read. Respects RLS — you only
        get rows from orgs you belong to.
      </p>
      <form
        action="/api/export"
        method="get"
        className="mt-6 grid gap-3 text-sm"
      >
        <label className="grid gap-1">
          <span>Entity</span>
          <select name="entity" className="rounded border border-border px-3 py-2">
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span>Format</span>
          <select name="format" className="rounded border border-border px-3 py-2">
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span>From (optional)</span>
          <input type="date" name="from" className="rounded border border-border px-3 py-2" />
        </label>
        <label className="grid gap-1">
          <span>To (optional)</span>
          <input type="date" name="to" className="rounded border border-border px-3 py-2" />
        </label>
        <button className="rounded bg-primary px-4 py-2 text-primary-foreground">
          Download
        </button>
      </form>
    </div>
  );
}
