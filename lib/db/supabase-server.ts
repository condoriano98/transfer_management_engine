import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv, requireServiceRoleKey } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function supabaseServer() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: CookieToSet[]) => {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component context — ignore.
        }
      },
    },
  });
}

/** Service-role client. Bypasses RLS — use only in webhooks/Inngest. */
export function supabaseAdmin() {
  const { url } = supabaseEnv();
  return createClient(url, requireServiceRoleKey(), {
    auth: { persistSession: false },
  });
}
