import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/db/supabase-server";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  redirect("/dashboard");
}

async function signUp(formData: FormData) {
  "use server";
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  redirect("/dashboard");
}

export default function LoginPage() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form action={signIn} className="mt-6 grid gap-3 text-sm">
        <input
          name="email" type="email" required placeholder="email"
          className="rounded border border-border px-3 py-2"
        />
        <input
          name="password" type="password" required placeholder="password"
          className="rounded border border-border px-3 py-2"
        />
        <button className="rounded bg-primary px-3 py-2 text-primary-foreground">
          Sign in
        </button>
      </form>
      <form action={signUp} className="mt-4 text-sm">
        <button className="text-muted-foreground underline">
          Or create an account
        </button>
      </form>
    </main>
  );
}
