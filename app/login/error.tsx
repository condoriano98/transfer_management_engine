"use client";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto mt-24 max-w-sm px-6 text-center">
      <h1 className="text-lg font-semibold">Login error</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message || "Could not sign in. Please try again."}
      </p>
      <a
        href="/login"
        className="mt-6 inline-block rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Back to login
      </a>
    </main>
  );
}
