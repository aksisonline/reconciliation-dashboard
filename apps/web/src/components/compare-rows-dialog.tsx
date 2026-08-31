import { useState } from "react";
import { Rows3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Button } from "#/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Badge } from "#/components/ui/badge";
import { Spinner } from "#/components/ui/spinner";
import { api, ApiError } from "#/lib/api";
import { buildCompareRows } from "#/lib/compare";
import type { OrderRecord, PaymentRecord } from "#/lib/types";

type RowsResponse =
  | { source: "orders"; rows: OrderRecord[] }
  | { source: "payments"; rows: PaymentRecord[] };

export function CompareRowsDialog({ flagId, label }: { flagId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RowsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<RowsResponse>(`/api/ingest/flags/${flagId}/rows`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load rows to compare.");
    } finally {
      setLoading(false);
    }
  }

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
          <DialogDescription>Fields that differ between the rows are highlighted.</DialogDescription>
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
                {buildCompareRows(data.source, data.rows).map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium text-muted-foreground">{row.label}</TableCell>
                    {row.values.map((v, i) => (
                      <TableCell key={i} className={row.allSame ? undefined : "text-destructive"}>
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
      </DialogContent>
    </Dialog>
  );
}
