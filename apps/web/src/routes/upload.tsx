import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, Download, FileWarning, Trash2, Upload as UploadIcon } from "lucide-react";
import { AuthGuard } from "#/components/auth-guard";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import { Separator } from "#/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { api, ApiError } from "#/lib/api";
import { FLAG_COPY } from "#/lib/copy";
import type { DataStatus, IngestionFlag } from "#/lib/types";

export const Route = createFileRoute("/upload")({
  component: () => (
    <AuthGuard title="Upload">
      <UploadPage />
    </AuthGuard>
  ),
});

type Phase = "idle" | "uploading" | "screened";

function UploadPage() {
  const navigate = useNavigate();
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [paymentsFile, setPaymentsFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [flags, setFlags] = useState<IngestionFlag[]>([]);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    refreshStatus();
    refreshFlags();
  }, []);

  async function refreshStatus() {
    try {
      setStatus(await api.get<DataStatus>("/api/data/status"));
    } catch {
      // non-fatal; status panel just stays empty
    }
  }

  async function refreshFlags() {
    try {
      const { flags } = await api.get<{ flags: IngestionFlag[] }>("/api/ingest/flags");
      setFlags(flags);
    } catch {
      // non-fatal
    }
  }

  async function handleUpload() {
    if (!ordersFile || !paymentsFile) {
      toast.error("Select both an orders CSV and a payments CSV.");
      return;
    }
    setPhase("uploading");
    try {
      const [ordersText, paymentsText] = await Promise.all([ordersFile.text(), paymentsFile.text()]);
      const [orders, payments] = await Promise.all([
        api.postCsv<{ inserted: number; flagged: number }>("/api/ingest/orders", ordersText),
        api.postCsv<{ inserted: number; flagged: number }>("/api/ingest/payments", paymentsText),
      ]);
      await api.post("/api/ingest/check");
      await refreshFlags();
      await refreshStatus();
      setPhase("screened");
      toast.success(`Loaded ${orders.inserted} orders and ${payments.inserted} payments.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed. Check the files and try again.");
      setPhase("idle");
    }
  }

  async function actOnFlag(id: string, action: "acknowledge" | "exclude") {
    await api.post(`/api/ingest/flags/${id}/${action}`);
    await refreshFlags();
    toast.success(action === "acknowledge" ? "Flag acknowledged." : "Row excluded from reconciliation.");
  }

  async function handleClear() {
    if (!confirm("Clear all uploaded orders, payments, flags, and reconciliation results?")) return;
    await api.del("/api/data");
    setFlags([]);
    setPhase("idle");
    await refreshStatus();
    toast.success("Data cleared.");
  }

  async function runReconciliation() {
    setReconciling(true);
    try {
      await api.post("/api/reconcile/run");
      toast.success("Reconciliation complete.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reconciliation failed to run.");
    } finally {
      setReconciling(false);
    }
  }

  const grouped = groupByType(flags);
  const openCount = flags.filter((f) => f.resolutionStatus === "open").length;
  const hasData = (status?.orders.count ?? 0) > 0 || (status?.payments.count ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Current data</CardTitle>
          <CardDescription>What's loaded right now for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {status ? (
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Orders" value={status.orders.count} />
              <Stat label="Payments" value={status.payments.count} />
              <Stat label="Reconciled rows" value={status.reconciliations.count} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </CardContent>
        {hasData && (
          <CardFooter className="justify-end">
            <Button variant="destructive" size="sm" onClick={handleClear}>
              <Trash2 /> Clear data
            </Button>
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload CSVs</CardTitle>
          <CardDescription>
            Not sure of the format?{" "}
            <a href="/sample-orders.csv" download className="inline-flex items-center gap-1 underline underline-offset-4">
              <Download className="size-3" /> sample orders.csv
            </a>{" "}
            ·{" "}
            <a href="/sample-payments.csv" download className="inline-flex items-center gap-1 underline underline-offset-4">
              <Download className="size-3" /> sample payments.csv
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FileField label="orders.csv" file={ordersFile} onChange={setOrdersFile} />
            <FileField label="payments.csv" file={paymentsFile} onChange={setPaymentsFile} />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleUpload} disabled={phase === "uploading"}>
            <UploadIcon /> {phase === "uploading" ? "Uploading…" : "Upload & screen"}
          </Button>
        </CardFooter>
      </Card>

      {flags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Screening report</CardTitle>
            <CardDescription>
              {openCount > 0
                ? `${openCount} issue${openCount === 1 ? "" : "s"} to review. These never block reconciliation — acknowledge or exclude what you want to handle.`
                : "All flags reviewed."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full" defaultValue={Object.keys(grouped)}>
              {Object.entries(grouped).map(([type, group]) => {
                const copy = FLAG_COPY[type] ?? { label: type, description: "", tone: "info" as const };
                return (
                  <AccordionItem key={type} value={type}>
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Badge variant={copy.tone === "warning" ? "destructive" : "secondary"}>{group.length}</Badge>
                        {copy.label}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">{copy.description}</p>
                      <ul className="flex flex-col gap-2">
                        {group.map((flag) => (
                          <li
                            key={flag.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                          >
                            <FlagDetail flag={flag} />
                            {flag.resolutionStatus === "open" ? (
                              <span className="flex shrink-0 gap-1">
                                <Button size="sm" variant="outline" onClick={() => actOnFlag(flag.id, "acknowledge")}>
                                  <CheckCircle2 /> Acknowledge
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => actOnFlag(flag.id, "exclude")}>
                                  Exclude
                                </Button>
                              </span>
                            ) : (
                              <Badge variant="outline" className="shrink-0 capitalize">
                                {flag.resolutionStatus}
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {!hasData && flags.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileWarning />
            </EmptyMedia>
            <EmptyTitle>No data uploaded yet</EmptyTitle>
            <EmptyDescription>Upload both CSVs above to get a screening report.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {(phase === "screened" || hasData) && (
        <>
          <Separator />
          <div className="flex justify-end">
            <Button onClick={runReconciliation} disabled={reconciling} size="lg">
              {reconciling ? "Running…" : "Run reconciliation"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function FlagDetail({ flag }: { flag: IngestionFlag }) {
  const details = flag.details as Record<string, unknown>;
  if (flag.flagType === "CASE_MISMATCH_NORMALIZED") {
    return (
      <span className="text-muted-foreground">
        <span className="rounded bg-muted px-1 font-mono text-xs line-through">{String(details.raw)}</span>
        {" → "}
        <span className="rounded bg-muted px-1 font-mono text-xs">{String(details.normalized)}</span>
      </span>
    );
  }
  if (flag.flagType === "DUPLICATE_KEY") {
    return (
      <span className="text-muted-foreground">
        <span className="font-mono text-xs">{String(details.order_id ?? details.transaction_ref)}</span> — first seen
        at row {String(details.firstSeenRow)}
      </span>
    );
  }
  if (flag.flagType === "ORPHAN_ORDER" || flag.flagType === "ORPHAN_PAYMENT" || flag.flagType === "MULTIPLE_PAYMENTS_FOR_ORDER") {
    return <span className="font-mono text-xs text-muted-foreground">{flag.rowRef}</span>;
  }
  return (
    <span className="text-muted-foreground">
      {flag.source} · {flag.rowRef ?? "—"}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function FileField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1 file:text-sm file:font-medium"
      />
      {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
    </div>
  );
}

function groupByType(flags: IngestionFlag[]) {
  const map: Record<string, IngestionFlag[]> = {};
  for (const f of flags) {
    (map[f.flagType] ??= []).push(f);
  }
  return map;
}
