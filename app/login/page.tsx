import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/db/supabase-server";

async function handleAuth(formData: FormData) {
  "use server";
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const action = String(formData.get("action"));
  const sb = await supabaseServer();

  if (action === "signup") {
    const { error } = await sb.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }
  redirect("/dashboard");
}

export default function LoginPage() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form action={handleAuth} className="mt-6 grid gap-3 text-sm">
        <input
          name="email" type="email" required placeholder="email"
          className="rounded border border-border px-3 py-2"
        />
        <input
          name="password" type="password" required minLength={6}
          placeholder="password (min 6 characters)"
          className="rounded border border-border px-3 py-2"
        />
        <div className="flex items-center gap-3">
          <button
            name="action" value="signin"
            className="rounded bg-primary px-3 py-2 text-primary-foreground"
          >
            Sign in
          </button>
          <button
            name="action" value="signup"
            className="text-muted-foreground underline"
          >
            Sign up
          </button>
        </div>
      </form>
    </main>
  );
}
