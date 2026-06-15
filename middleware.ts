import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

/**
 * Edge middleware: refresh the Supabase session cookie on every navigation
 * through protected routes. If the session is invalid, redirect to /login.
 */
const PROTECTED = ["/dashboard", "/transfers", "/approvals", "/ledger", "/export", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let res = NextResponse.next();
  const { url, anonKey } = supabaseEnv();

  const sb = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) =>
        toSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options),
        ),
    },
  });

  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|auth).*)"],
};
