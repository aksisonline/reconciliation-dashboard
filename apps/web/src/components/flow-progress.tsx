import { Check } from "lucide-react";
import { cn } from "#/lib/utils";
import type { DataStatus } from "#/lib/types";

const STAGES = ["Upload", "Screening", "Reconcile", "Results"] as const;

/** Upload -> Screening -> Reconcile -> Results, derived from data status rather than
 * tracked separately — screening is automatic once data lands, so it's marked done
 * alongside upload; the only real waits are "haven't uploaded" and "haven't reconciled". */
export function currentStage(status: DataStatus | null): number {
  if (!status) return 0;
  const hasData = status.orders.count > 0 || status.payments.count > 0;
  if (!hasData) return 0;
  const lastUpload = [status.orders.lastUpload, status.payments.lastUpload].filter(Boolean).sort().at(-1) ?? null;
  const stale = status.reconciliations.lastRun === null || (lastUpload !== null && status.reconciliations.lastRun < lastUpload);
  return stale ? 2 : 3;
}

export function FlowProgress({ status }: { status: DataStatus | null }) {
  const current = currentStage(status);

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
        {STAGES.map((_, i) => (
          <div key={i} className={cn("flex-1", i < 3 && "border-r-2 border-background", i <= current ? "bg-foreground" : "bg-secondary")} />
        ))}
      </div>
      <div className="flex justify-between text-xs">
        {STAGES.map((label, i) => (
          <span key={label} className={cn("flex items-center gap-1.5", i <= current ? "text-foreground" : "text-muted-foreground")}>
            {i < current ? (
              <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <span className={cn("size-1.5 rounded-full", i === current ? "bg-foreground" : "bg-muted-foreground")} />
            )}
            <span className={i === current ? "font-semibold" : undefined}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
