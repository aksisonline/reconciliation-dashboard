import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "#/components/auth-guard";
import { Input } from "#/components/ui/input";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "#/components/ui/dialog";
import { api, ApiError } from "#/lib/api";
import type { Discrepancy, DiscrepancyType, Explanation } from "#/lib/types";

export const Route = createFileRoute("/discrepancies")({
  component: () => (
    <AuthGuard>
      <DiscrepanciesPage />
    </AuthGuard>
  ),
});

const TYPES: DiscrepancyType[] = [
  "MISSING_PAYMENT",
  "MISSING_ORDER",
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "STATUS_MISMATCH",
  "DUPLICATE_PAYMENT",
  "UNRESOLVED_REFUND",
];

function DiscrepanciesPage() {
  const [rows, setRows] = useState<Discrepancy[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
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
      if (type) params.set("type", type);
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
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Discrepancies</h1>

      <div className="mt-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search order id, transaction ref, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded-md border">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No discrepancies match your filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Amount at risk</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell>
                    <Badge variant="warning">{r.discrepancyType?.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell>{r.order?.orderId ?? "—"}</TableCell>
                  <TableCell>{r.payment?.transactionRef ?? "—"}</TableCell>
                  <TableCell>{Number(r.amountAtRisk).toLocaleString(undefined, { style: "currency", currency: "USD" })}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && <DiscrepancyDetail discrepancy={selected} />}
      </Dialog>
    </div>
  );
}

function DiscrepancyDetail({ discrepancy }: { discrepancy: Discrepancy }) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explainState, setExplainState] = useState<"idle" | "loading" | "error">("idle");
  const [explainError, setExplainError] = useState<string | null>(null);

  async function explain() {
    setExplainState("loading");
    setExplainError(null);
    try {
      const res = await api.post<{ explanation: Explanation }>(`/api/discrepancies/${discrepancy.id}/explain`);
      setExplanation(res.explanation);
      setExplainState("idle");
    } catch (err) {
      setExplainState("error");
      setExplainError(err instanceof ApiError ? err.message : "Explanation unavailable right now.");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{discrepancy.discrepancyType?.replace(/_/g, " ")}</DialogTitle>
        <DialogDescription>
          Amount at risk:{" "}
          {Number(discrepancy.amountAtRisk).toLocaleString(undefined, { style: "currency", currency: "USD" })}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-medium">Order</div>
          <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
            {discrepancy.order ? JSON.stringify(discrepancy.order, null, 2) : "No linked order"}
          </pre>
        </div>
        <div>
          <div className="font-medium">Payment</div>
          <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
            {discrepancy.payment ? JSON.stringify(discrepancy.payment, null, 2) : "No linked payment"}
          </pre>
        </div>
      </div>

      <div className="border-t pt-4">
        {!explanation && explainState !== "loading" && (
          <Button size="sm" onClick={explain}>
            Explain this discrepancy
          </Button>
        )}
        {explainState === "loading" && <p className="text-sm text-muted-foreground">Asking the LLM…</p>}
        {explainState === "error" && (
          <div className="flex items-center gap-2">
            <p className="text-sm text-destructive">{explainError}</p>
            <Button size="sm" variant="outline" onClick={explain}>
              Retry
            </Button>
          </div>
        )}
        {explanation && (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium">Likely cause: </span>
              {explanation.likely_cause}
            </p>
            <p>
              <span className="font-medium">Recommended action: </span>
              {explanation.recommended_action}
            </p>
            <Badge variant="outline" className="w-fit">
              Confidence: {explanation.confidence}
            </Badge>
          </div>
        )}
      </div>
    </DialogContent>
  );
}
