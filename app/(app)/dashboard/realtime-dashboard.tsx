"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

type Balance = {
  code: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
};

type PendingRequest = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

function fmt(n: number, currency = "IDR") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n / 100);
}

export function RealtimeDashboard({
  initialBalances,
  initialPending,
}: {
  initialBalances: Balance[];
  initialPending: PendingRequest[];
}) {
  const [balances, setBalances] = useState<Balance[]>(initialBalances);
  const [pending, setPending] = useState<PendingRequest[]>(initialPending);

  useEffect(() => {
    const { url, anonKey } = supabaseEnv();
    const supabase = createBrowserClient(url, anonKey);

    const balancesChannel = supabase
      .channel("account_balances")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "account_balances" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setBalances((prev) =>
              prev.map((b) =>
                b.code === (payload.new as Balance).code
                  ? (payload.new as Balance)
                  : b
              )
            );
          }
        }
      )
      .subscribe();

    const transfersChannel = supabase
      .channel("transfer_requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transfer_requests" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newReq = payload.new as PendingRequest;
            if (newReq.status === "pending") {
              setPending((prev) => [newReq, ...prev].slice(0, 5));
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as PendingRequest;
            if (updated.status !== "pending") {
              setPending((prev) => prev.filter((p) => p.id !== updated.id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      balancesChannel.unsubscribe();
      transfersChannel.unsubscribe();
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {balances.map((a) => (
          <div key={a.code} className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase text-muted-foreground">{a.type}</div>
            <div className="mt-1 text-sm font-medium">{a.name}</div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">
              {fmt(Number(a.balance ?? 0), a.currency ?? "IDR")}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Pending approvals</h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {pending.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">Nothing pending.</li>
          ) : (
            pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-4 text-sm">
                <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                <span className="tabular-nums">{fmt(r.amount, r.currency)}</span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
