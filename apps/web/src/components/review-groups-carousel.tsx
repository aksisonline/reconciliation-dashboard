import { useEffect, useState } from "react";
import { ChevronRight, Layers } from "lucide-react";
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

export type ReviewItem = { flagId: string; label: string };

/** Steps through every group flag one at a time in a single dialog — apply/skip advances to
 * the next, so a whole screening report can be resolved without scrolling back through the list. */
export function ReviewGroupsCarousel({ items, onDone }: { items: ReviewItem[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<RowsResponse | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const current = items[index];
  const isLast = index === items.length - 1;

  useEffect(() => {
    if (!open || !current) return;
    setData(null);
    setError(null);
    setLoading(true);
    loadGroupRows(current.flagId)
      .then((res) => {
        setData(res);
        setKeep(res.rows.map((r) => !r.isExcluded));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load rows to compare."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, current?.flagId]);

  function advance() {
    if (isLast) {
      setOpen(false);
      setIndex(0);
      onDone();
      toast.success("Done reviewing.");
    } else {
      setIndex((i) => i + 1);
    }
  }

  async function applyAndNext() {
    if (!data || !current) return;
    setApplying(true);
    try {
      await applyGroupDecision(current.flagId, data, keep);
      advance();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save your selection.");
    } finally {
      setApplying(false);
    }
  }

  const excludedCount = keep.filter((k) => !k).length;
  if (items.length === 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setIndex(0);
          onDone();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Layers /> Review all ({items.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4 pr-6">
            <span>{current?.label}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {index + 1} of {items.length}
            </span>
          </DialogTitle>
          <DialogDescription>
            Fields that differ are highlighted. Uncheck a row to exclude it, or leave both checked to keep them
            as-is — then move to the next one.
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

        <DialogFooter className="items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={advance} disabled={applying}>
            Skip
          </Button>
          <Button onClick={applyAndNext} disabled={applying || loading}>
            {applying ? (
              "Saving…"
            ) : (
              <>
                {excludedCount > 0 ? `Exclude ${excludedCount}, keep the rest` : "Keep as-is"}
                {!isLast && (
                  <>
                    {" "}
                    &amp; next <ChevronRight />
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
