// Supabase project credentials.
//
// URL + anon key are public by design — they ship to the browser, and Row
// Level Security gates access. Hardcoded as fallbacks so the app works on
// any deployment without separate env var wiring; override either by setting
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
//
// SUPABASE_SERVICE_ROLE_KEY bypasses RLS and is NEVER hardcoded — it's only
// required for webhook + Inngest routes, and must come from env.
const DEFAULT_URL = "https://zinvrjjxnkgpaglammge.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbnZyamp4bmtncGFnbGFtbWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTEyNzcsImV4cCI6MjA5NzA2NzI3N30.f5nz9l77v3ffMs4H8rg1P8GfZ_0zhH4M31RlyTmDrKM";

export function supabaseEnv(): { url: string; anonKey: string } {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY,
  };
}

export function requireServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Required for webhook + Inngest " +
        "routes that bypass RLS. Set it in Vercel → Settings → Environment Variables.",
    );
  }
  return key;
}
