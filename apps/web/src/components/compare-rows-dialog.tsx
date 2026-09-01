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
import { Spinner } from "#/components/ui/spinner";
import { CompareRowsTable } from "#/components/compare-rows-table";
import { ApiError } from "#/lib/api";
import { loadGroupRows, applyGroupDecision, type RowsResponse } from "#/lib/group-flags";

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
      const res = await loadGroupRows(flagId);
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
      const changedCount = await applyGroupDecision(flagId, data, keep);
      toast.success(
        changedCount > 0
          ? `Updated ${changedCount} row${changedCount === 1 ? "" : "s"}. Re-run reconciliation to apply.`
          : "Marked as reviewed.",
      );
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
        {data && (
          <CompareRowsTable
            data={data}
            keep={keep}
            onKeepChange={(i, value) => setKeep((prev) => prev.map((v, idx) => (idx === i ? value : v)))}
          />
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
