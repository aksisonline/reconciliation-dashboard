import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AuthGuard } from "#/components/auth-guard";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Button } from "#/components/ui/button";
import { api, ApiError } from "#/lib/api";
import type { DashboardSummary } from "#/lib/types";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  ),
});

function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardSummary>("/api/dashboard/summary")
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard."));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return <div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  const noData = summary.totalOrders === 0 && summary.totalPayments === 0;
  const chartData = Object.entries(summary.byType).map(([type, v]) => ({
    type: type.replace(/_/g, " "),
    count: v.count,
    amountAtRisk: v.amountAtRisk,
  }));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button asChild variant="outline" size="sm">
          <Link to="/discrepancies">View drill-down table</Link>
        </Button>
      </div>

      {noData ? (
        <Card className="mt-6">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No data yet.{" "}
            <Link to="/upload" className="underline underline-offset-4">
              Upload your CSVs
            </Link>{" "}
            to get started.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Headline label="Total orders" value={summary.totalOrders} />
            <Headline label="Total payments" value={summary.totalPayments} />
            <Headline label="Value reconciled" value={money(summary.valueReconciled)} />
            <Headline label="Value in dispute" value={money(summary.valueInDispute)} tone="warning" />
            <Headline label="Money at risk" value={money(summary.moneyAtRisk)} tone="destructive" />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Discrepancies by type</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No discrepancies found — everything reconciles.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="type" width={140} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "count" ? value : money(Number(value)),
                          name,
                        ]}
                      />
                      <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Headline({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warning" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={
            "mt-1 text-xl font-semibold " +
            (tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "")
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
