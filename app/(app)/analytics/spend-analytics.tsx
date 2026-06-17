"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

type Transfer = {
  id: string;
  status: string;
  provider: string;
  executed_at: string;
  settled_at: string;
  transfer_requests: {
    amount: number;
    currency: string;
    to_account_id: string;
    accounts: {
      code: string;
      name: string;
    };
  };
};

type ExpenseBalance = {
  code: string;
  name: string;
  balance: number;
  currency: string;
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function fmt(n: number, currency = "IDR") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n / 100);
}

export function SpendAnalytics({
  transfers,
  expenseBalances,
}: {
  transfers: Transfer[];
  expenseBalances: ExpenseBalance[];
}) {
  const platformSpend = useMemo(() => {
    const byPlatform: Record<string, number> = {};
    for (const t of transfers) {
      const platform = t.transfer_requests.accounts.name;
      byPlatform[platform] = (byPlatform[platform] ?? 0) + t.transfer_requests.amount;
    }
    return Object.entries(byPlatform)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transfers]);

  const dailySpend = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of transfers) {
      const day = t.settled_at?.slice(0, 10) ?? "unknown";
      byDay[day] = (byDay[day] ?? 0) + t.transfer_requests.amount;
    }
    return Object.entries(byDay)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }, [transfers]);

  const totalSpend = platformSpend.reduce((sum, p) => sum + p.value, 0);
  const poolBalance = expenseBalances.find((b) => b.code === "pool")?.balance ?? 0;

  return (
    <div className="mt-6 space-y-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total Spend" value={fmt(totalSpend)} />
        <StatCard label="Pool Balance" value={fmt(poolBalance)} />
        <StatCard label="Transactions" value={transfers.length.toString()} />
      </div>

      <section>
        <h2 className="text-lg font-medium mb-4">Spend by Platform</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={platformSpend}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {platformSpend.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => fmt(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-border p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={platformSpend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis tickFormatter={(v) => fmt(v)} />
                <Tooltip formatter={(value: number) => fmt(value)} />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-4">Daily Spend Trend (Last 30 Days)</h2>
        <div className="rounded-lg border border-border p-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailySpend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(v) => fmt(v)} />
              <Tooltip formatter={(value: number) => fmt(value)} />
              <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
