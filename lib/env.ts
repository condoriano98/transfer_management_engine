const CLIENT_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const SERVER_ONLY_VARS = ["SUPABASE_SERVICE_ROLE_KEY"] as const;

export function getMissingSupabaseEnv(
  opts: { includeServiceKey?: boolean } = {},
): string[] {
  const keys = opts.includeServiceKey
    ? [...CLIENT_VARS, ...SERVER_ONLY_VARS]
    : [...CLIENT_VARS];
  return keys.filter((k) => !process.env[k]);
}

export function requireSupabaseEnv(opts: { includeServiceKey?: boolean } = {}): {
  url: string;
  anonKey: string;
  serviceKey: string | undefined;
} {
  const missing = getMissingSupabaseEnv(opts);
  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase env vars: ${missing.join(", ")}. ` +
        `Set them in Vercel → Settings → Environment Variables (Production), then redeploy.`,
    );
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
