// Supabase project credentials.
//
// URL + anon key are public by design — they ship to the browser, and Row
// Level Security gates access. Hardcoded as fallbacks so the app works on
// any deployment without separate env var wiring; override either by setting
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
//
// SUPABASE_SERVICE_ROLE_KEY bypasses RLS and is NEVER hardcoded — it's only
// required for webhook + Inngest routes, and must come from env.
const DEFAULT_URL = "https://awsskfxtrhtrmrwlnasv.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3c3NrZnh0cmh0cm1yd2xuYXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjA5ODksImV4cCI6MjA5NDgzNjk4OX0.f324Vb6T_aFPxghO0bHJdmBKYkUWWVhphIgu75f3bQs";

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
