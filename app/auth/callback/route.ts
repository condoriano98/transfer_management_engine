import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db/supabase-server";

/**
 * GET /auth/callback
 *
 * Supabase Auth redirects here after:
 *   - Email confirmation (sign-up verification link)
 *   - Password reset (forgot password link)
 *   - Magic link (future)
 *
 * The URL carries a `code` query parameter. We exchange it for a session
 * and redirect to /dashboard. If the flow is a password reset, the session
 * contains user metadata that indicates the reset intent.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  const sb = await supabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url),
    );
  }

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
