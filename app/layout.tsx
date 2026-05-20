import type { Metadata } from "next";
import "./globals.css";
import { getMissingSupabaseEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Transfer Management Engine",
  description:
    "Multi-tenant transfer, approval, and double-entry ledger platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const missing = getMissingSupabaseEnv();
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        {missing.length > 0 ? <SetupRequired missing={missing} /> : children}
      </body>
    </html>
  );
}

function SetupRequired({ missing }: { missing: string[] }) {
  const vercelEnvUrl =
    "https://vercel.com/condoriano98s-projects/transfer-management-engine/settings/environment-variables";
  const supabaseApiUrl = "https://supabase.com/dashboard/project/_/settings/api";
  return (
    <main className="mx-auto mt-24 max-w-2xl px-6">
      <h1 className="text-2xl font-semibold">Setup required</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        This deployment is missing Supabase credentials. Set the variables
        below in Vercel for the Production environment, then redeploy.
      </p>
      <ul className="mt-4 grid gap-2 font-mono text-sm">
        {missing.map((k) => (
          <li key={k}>• {k}</li>
        ))}
      </ul>
      <p className="mt-6 text-sm">
        <a
          className="underline"
          href={vercelEnvUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open Vercel env vars
        </a>
        {" · "}
        <a
          className="underline"
          href={supabaseApiUrl}
          target="_blank"
          rel="noreferrer"
        >
          Supabase API settings
        </a>
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        After saving, run a fresh deployment (Vercel does not auto-redeploy
        on env var changes). In the Deployments tab, open the latest
        deployment, click ⋯ → Redeploy, and uncheck "Use existing Build
        Cache".
      </p>
    </main>
  );
}
