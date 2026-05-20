import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">
        Transfer Management Engine
      </h1>
      <p className="mt-4 text-muted-foreground">
        Multi-tenant, auditable money movement — double-entry ledger, approval
        workflows, realtime dashboards, raw data export.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-border px-4 py-2"
        >
          Dashboard
        </Link>
      </div>
      <ul className="mt-10 grid gap-3 text-sm">
        <li>• Append-only ledger — balances derived from journal entries</li>
        <li>• Org-scoped RLS, RBAC roles: admin / finance / ads_manager / viewer</li>
        <li>• Approval rules per account + threshold</li>
        <li>• Xendit + bank adapters, Inngest durable execution</li>
        <li>• CSV/JSON export for every entity</li>
      </ul>
    </main>
  );
}
