import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/db/supabase-server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await sb
    .from("memberships")
    .select("org_id,role,orgs(id,name)")
    .order("created_at", { ascending: true });

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r border-border bg-muted/30 p-4">
        <div className="text-sm font-semibold">Transfer Engine</div>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link href="/dashboard" className="rounded px-2 py-1.5 hover:bg-muted">Dashboard</Link>
          <Link href="/transfers" className="rounded px-2 py-1.5 hover:bg-muted">Transfers</Link>
          <Link href="/approvals" className="rounded px-2 py-1.5 hover:bg-muted">Approvals</Link>
          <Link href="/ledger"    className="rounded px-2 py-1.5 hover:bg-muted">Ledger</Link>
          <Link href="/export"    className="rounded px-2 py-1.5 hover:bg-muted">Export</Link>
          <Link href="/settings"  className="rounded px-2 py-1.5 hover:bg-muted">Settings</Link>
        </nav>
        <div className="mt-8 text-xs text-muted-foreground">
          {memberships?.length ?? 0} org{(memberships?.length ?? 0) === 1 ? "" : "s"}
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
