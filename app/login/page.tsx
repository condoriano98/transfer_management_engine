"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/db/supabase-browser";

type FormState = {
  error: string | null;
  confirmationSent: string | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({
    error: null,
    confirmationSent: null,
  });

  async function handleSubmit(formData: FormData) {
    setState({ error: null, confirmationSent: null });
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));
    const action = String(formData.get("action"));

    if (!email.includes("@")) {
      setState({ error: "Please enter a valid email address.", confirmationSent: null });
      return;
    }
    if (password.length < 6) {
      setState({ error: "Password must be at least 6 characters.", confirmationSent: null });
      return;
    }

    startTransition(async () => {
      try {
        const sb = supabaseBrowser();

        if (action === "signup") {
          const { error } = await sb.auth.signUp({ email, password });
          if (error) {
            setState({ error: error.message, confirmationSent: null });
          } else {
            setState({ error: null, confirmationSent: email });
          }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) {
            setState({
              error:
                error.message === "Invalid login credentials"
                  ? "Invalid email or password."
                  : error.message,
              confirmationSent: null,
            });
          } else {
            router.push("/dashboard");
            router.refresh();
          }
        }
      } catch (err) {
        setState({
          error: "Network error. Please check your connection and try again.",
          confirmationSent: null,
        });
      }
    });
  }

  if (state.confirmationSent) {
    return (
      <main className="mx-auto mt-24 max-w-sm px-6">
        <div className="text-center">
          <div className="text-2xl">&#10003;</div>
          <h1 className="mt-3 text-xl font-semibold">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-medium">{state.confirmationSent}</span>.
            Click it to activate your account, then sign in.
          </p>
          <button
            onClick={() => setState({ error: null, confirmationSent: null })}
            className="mt-6 rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-24 max-w-sm px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const submitter = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          formData.set("action", submitter?.value ?? "signin");
          await handleSubmit(formData);
        }}
        className="mt-6 grid gap-3 text-sm"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="email"
          className="rounded border border-border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="password (min 6 characters)"
          className="rounded border border-border px-3 py-2"
        />

        {state.error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            name="action"
            value="signin"
            disabled={isPending}
            className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="submit"
            name="action"
            value="signup"
            disabled={isPending}
            className="text-muted-foreground underline disabled:opacity-50"
          >
            {isPending ? "Signing up…" : "Sign up"}
          </button>
        </div>
      </form>
    </main>
  );
}
