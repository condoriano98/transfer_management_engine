"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/db/supabase-browser";

type FormState = {
  error: string | null;
  confirmationSent: string | null;
};

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 3) return { score, label: "Fair", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({
    error: null,
    confirmationSent: null,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [strength, setStrength] = useState({ score: 0, label: "", color: "" });

  function handlePasswordChange(value: string) {
    setStrength(passwordStrength(value));
  }

  async function handleSubmit(formData: FormData) {
    setState({ error: null, confirmationSent: null });
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));
    const confirm = String(formData.get("confirm_password") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const action = String(formData.get("action"));

    if (!email.includes("@")) {
      setState({ error: "Please enter a valid email address.", confirmationSent: null });
      return;
    }
    if (password.length < 6) {
      setState({ error: "Password must be at least 6 characters.", confirmationSent: null });
      return;
    }
    if (mode === "signup" && password !== confirm) {
      setState({ error: "Passwords do not match.", confirmationSent: null });
      return;
    }

    startTransition(async () => {
      try {
        const sb = supabaseBrowser();

        if (action === "signup" || mode === "signup") {
          const { error } = await sb.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
              data: name ? { display_name: name } : undefined,
            },
          });
          if (error) {
            const msg =
              error.message.includes("already registered") ||
              error.message.includes("already exists")
                ? "An account with this email already exists. Sign in instead."
                : error.message;
            setState({ error: msg, confirmationSent: null });
          } else {
            setState({ error: null, confirmationSent: email });
          }
        } else {
          const { error } = await sb.auth.signInWithPassword({
            email,
            password,
          });
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
      } catch {
        setState({
          error: "Network error. Please check your connection and try again.",
          confirmationSent: null,
        });
      }
    });
  }

  async function handleForgotPassword(e: React.MouseEvent) {
    e.preventDefault();
    const emailInput = document.querySelector<HTMLInputElement>("input[name=email]");
    const email = emailInput?.value?.trim();
    if (!email || !email.includes("@")) {
      setState({ error: "Enter your email address above first.", confirmationSent: null });
      return;
    }
    startTransition(async () => {
      try {
        const sb = supabaseBrowser();
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback`,
        });
        if (error) {
          setState({ error: error.message, confirmationSent: null });
        } else {
          setState({ error: null, confirmationSent: email });
        }
      } catch {
        setState({
          error: "Network error. Please check your connection and try again.",
          confirmationSent: null,
        });
      }
    });
  }

  if (state.confirmationSent) {
    const isReset = mode === "signin";
    return (
      <main className="mx-auto mt-24 max-w-sm px-6">
        <div className="text-center">
          <div className="text-2xl">&#10003;</div>
          <h1 className="mt-3 text-xl font-semibold">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isReset
              ? "We sent a password reset link to "
              : "We sent a confirmation link to "}
            <span className="font-medium">{state.confirmationSent}</span>.
            {isReset
              ? " Click the link to set a new password."
              : " Click it to activate your account, then sign in."}
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
      <h1 className="text-2xl font-semibold">
        {mode === "signup" ? "Create account" : "Sign in"}
      </h1>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const submitter = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          formData.set("action", submitter?.value ?? mode);
          await handleSubmit(formData);
        }}
        className="mt-6 grid gap-3 text-sm"
      >
        {mode === "signup" && (
          <input
            name="name"
            type="text"
            placeholder="display name (optional)"
            className="rounded border border-border px-3 py-2"
          />
        )}

        <input
          name="email"
          type="email"
          required
          placeholder="email"
          className="rounded border border-border px-3 py-2"
        />

        <div className="relative">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            placeholder="password (min 6 characters)"
            className="w-full rounded border border-border px-3 py-2 pr-10"
            onChange={(e) => mode === "signup" && handlePasswordChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showPassword ? "hide" : "show"}
          </button>
        </div>

        {mode === "signup" && (
          <>
            <input
              name="confirm_password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="confirm password"
              className="rounded border border-border px-3 py-2"
            />
            {strength.score > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex h-1.5 flex-1 gap-1">
                  <div
                    className={`h-full flex-1 rounded ${strength.score >= 1 ? strength.color : "bg-muted"}`}
                  />
                  <div
                    className={`h-full flex-1 rounded ${strength.score >= 2 ? strength.color : "bg-muted"}`}
                  />
                  <div
                    className={`h-full flex-1 rounded ${strength.score >= 3 ? strength.color : "bg-muted"}`}
                  />
                  <div
                    className={`h-full flex-1 rounded ${strength.score >= 4 ? strength.color : "bg-muted"}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{strength.label}</span>
              </div>
            )}
          </>
        )}

        {state.error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            name="action"
            value={mode}
            disabled={isPending}
            className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
          >
            {isPending
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>

          {mode === "signin" && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isPending}
              className="text-muted-foreground underline disabled:opacity-50"
            >
              Forgot password?
            </button>
          )}
        </div>
      </form>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setState({ error: null, confirmationSent: null });
          setStrength({ score: 0, label: "", color: "" });
        }}
        className="mt-4 text-sm text-muted-foreground underline"
      >
        {mode === "signin"
          ? "Don't have an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </main>
  );
}
