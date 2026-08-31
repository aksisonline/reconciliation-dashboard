import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { AuthGuard } from "#/components/auth-guard";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "#/components/ui/card";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Skeleton } from "#/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "#/components/ui/chart";
import { api, ApiError } from "#/lib/api";
import { DISCREPANCY_COPY } from "#/lib/copy";
import type { DashboardSummary } from "#/lib/types";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AuthGuard title="Dashboard">
      <Dashboard />
    </AuthGuard>
  ),
});

const chartConfig = {
  count: { label: "Discrepancies", color: "var(--chart-1)" },
} satisfies ChartConfig;

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
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>Couldn't load the dashboard</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const noData = summary.totalOrders === 0 && summary.totalPayments === 0;
  const chartData = Object.entries(summary.byType)
    .map(([type, v]) => ({
      type,
      label: DISCREPANCY_COPY[type as keyof typeof DISCREPANCY_COPY]?.label ?? type,
      count: v.count,
      amountAtRisk: v.amountAtRisk,
    }))
    .sort((a, b) => b.count - a.count);

  if (noData) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldCheck />
          </EmptyMedia>
          <EmptyTitle>No data yet</EmptyTitle>
          <EmptyDescription>Upload your orders and payments CSVs to see a reconciliation.</EmptyDescription>
        </EmptyHeader>
        <Button asChild>
          <Link to="/upload">
            Upload data <ArrowRight />
          </Link>
        </Button>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total orders" value={summary.totalOrders.toLocaleString()} />
        <StatCard label="Total payments" value={summary.totalPayments.toLocaleString()} />
        <StatCard label="Value reconciled" value={money(summary.valueReconciled)} tone="good" />
        <StatCard label="Value in dispute" value={money(summary.valueInDispute)} tone="warn" />
        <StatCard label="Money at risk" value={money(summary.moneyAtRisk)} tone="bad" />

      </div>

      <Card>
        <CardHeader>
          <CardTitle>Discrepancies by type</CardTitle>
          <CardDescription>What kind of problems there are, and how many of each.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link to="/discrepancies">
                Drill down <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShieldCheck />
                </EmptyMedia>
                <EmptyTitle>Everything reconciles</EmptyTitle>
                <EmptyDescription>No discrepancies were found in the current data.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ChartContainer config={chartConfig} className="h-80 w-full">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={140} tickLine={false} axisLine={false} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, item) =>
                        name === "count" ? (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">
                              {value} {value === 1 ? "discrepancy" : "discrepancies"}
                            </span>
                            <span className="font-mono font-medium tabular-nums">
                              {money(item.payload.amountAtRisk)} at risk
                            </span>
                          </div>
                        ) : null
                      }
                    />
                  }
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {chartData.slice(0, 4).map((d) => (
          <Card key={d.type}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{d.label}</CardTitle>
                <Badge variant="secondary">{d.count}</Badge>
              </div>
              <CardDescription>{DISCREPANCY_COPY[d.type as keyof typeof DISCREPANCY_COPY]?.description}</CardDescription>
            </CardHeader>
            <CardFooter className="pt-0 text-sm text-muted-foreground">
              {money(d.amountAtRisk)} at risk
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            "text-2xl font-semibold tabular-nums @[200px]/card:text-3xl " +
            (tone === "bad"
              ? "text-destructive"
              : tone === "warn"
                ? "text-amber-600 dark:text-amber-400"
                : tone === "good"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "")
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
