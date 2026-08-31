import { useState } from "react";
import { Rows3 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Button } from "#/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Badge } from "#/components/ui/badge";
import { Checkbox } from "#/components/ui/checkbox";
import { Spinner } from "#/components/ui/spinner";
import { api, ApiError } from "#/lib/api";
import { buildCompareRows } from "#/lib/compare";
import type { OrderRecord, PaymentRecord } from "#/lib/types";

type RowsResponse =
  | { source: "orders"; rows: OrderRecord[] }
  | { source: "payments"; rows: PaymentRecord[] };

export function CompareRowsDialog({
  flagId,
  label,
  onApplied,
}: {
  flagId: string;
  label: string;
  onApplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RowsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [applying, setApplying] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<RowsResponse>(`/api/ingest/flags/${flagId}/rows`);
      setData(res);
      setKeep(res.rows.map((r) => !r.isExcluded));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load rows to compare.");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!data) return;
    setApplying(true);
    try {
      const changed = data.rows
        .map((row, i) => ({ row, wantKeep: keep[i] }))
        .filter(({ row, wantKeep }) => wantKeep === row.isExcluded); // flipped from current state

      await Promise.all(
        changed.map(({ row, wantKeep }) =>
          api.post(`/api/ingest/rows/${data.source}/${row.id}`, { isExcluded: !wantKeep }),
        ),
      );

      if (changed.length > 0) {
        toast.success(`Updated ${changed.length} row${changed.length === 1 ? "" : "s"}. Re-run reconciliation to apply.`);
      }
      setOpen(false);
      onApplied?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save your selection.");
    } finally {
      setApplying(false);
    }
  }

  const excludedCount = keep.filter((k) => !k).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !data) load();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Rows3 /> Compare rows
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Fields that differ are highlighted. Uncheck a row to exclude it from reconciliation, or leave both
            checked to keep them as-is.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading…
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {data && data.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No matching rows found (they may have been excluded).</p>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  {data.rows.map((_, i) => (
                    <TableHead key={i}>Row {i + 1}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium text-muted-foreground">Keep this row?</TableCell>
                  {data.rows.map((_, i) => (
                    <TableCell key={i}>
                      <Checkbox
                        checked={keep[i] ?? true}
                        onCheckedChange={(checked) =>
                          setKeep((prev) => prev.map((v, idx) => (idx === i ? checked === true : v)))
                        }
                      />
                    </TableCell>
                  ))}
                </TableRow>
                {buildCompareRows(data.source, data.rows).map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium text-muted-foreground">{row.label}</TableCell>
                    {row.values.map((v, i) => (
                      <TableCell
                        key={i}
                        className={
                          !keep[i]
                            ? "text-muted-foreground line-through"
                            : row.allSame
                              ? undefined
                              : "text-destructive"
                        }
                      >
                        {v}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.rows.length > 1 && (
              <div className="mt-3">
                {buildCompareRows(data.source, data.rows).every((r) => r.allSame) ? (
                  <Badge variant="secondary">These rows are identical duplicates</Badge>
                ) : (
                  <Badge variant="destructive">These rows differ — not a plain duplicate</Badge>
                )}
              </div>
            )}
          </div>
        )}

        {data && data.rows.length > 0 && (
          <DialogFooter>
            <Button onClick={apply} disabled={applying}>
              {applying
                ? "Saving…"
                : excludedCount > 0
                  ? `Exclude ${excludedCount} row${excludedCount === 1 ? "" : "s"}, keep the rest`
                  : "Keep all rows as-is"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
