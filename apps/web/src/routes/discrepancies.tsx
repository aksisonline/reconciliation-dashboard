import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, Search, ShieldCheck } from "lucide-react";
import { AuthGuard } from "#/components/auth-guard";
import { Input } from "#/components/ui/input";
import { Badge } from "#/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { DiscrepancySheet } from "#/components/discrepancy-sheet";
import { ExportMenu } from "#/components/export-menu";
import { api, ApiError } from "#/lib/api";
import { DISCREPANCY_COPY } from "#/lib/copy";
import type { Discrepancy, DiscrepancyType } from "#/lib/types";

export const Route = createFileRoute("/discrepancies")({
  component: () => (
    <AuthGuard title="Discrepancies" actions={<ExportMenu />}>
      <DiscrepanciesPage />
    </AuthGuard>
  ),
});

const TYPES = Object.keys(DISCREPANCY_COPY) as DiscrepancyType[];

function DiscrepanciesPage() {
  const [rows, setRows] = useState<Discrepancy[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Discrepancy | null>(null);

  useEffect(() => {
    const handle = setTimeout(load, 250); // debounce search input
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (type !== "all") params.set("type", type);
      const { discrepancies } = await api.get<{ discrepancies: Discrepancy[] }>(
        `/api/discrepancies?${params.toString()}`,
      );
      setRows(discrepancies);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load discrepancies.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order id, transaction ref, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DISCREPANCY_COPY[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>No discrepancies match your filters</EmptyTitle>
              <EmptyDescription>Try clearing the search or type filter.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount at risk</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isResolved = r.order?.resolutionStatus === "resolved" || r.payment?.resolutionStatus === "resolved";
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell>
                      <Badge variant="destructive">
                        {r.discrepancyType ? DISCREPANCY_COPY[r.discrepancyType].label : r.discrepancyType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.order?.orderId ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.payment?.transactionRef ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.amountAtRisk).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    </TableCell>
                    <TableCell>
                      {isResolved && (
                        <Badge variant="outline" className="gap-1">
                          <CheckCheck className="size-3" /> Resolved
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <DiscrepancySheet
        discrepancy={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onDiscrepancyUpdated={(updated) => {
          setSelected(updated);
          setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        }}
      />
    </div>
  );
}
