import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthGuard } from "#/components/auth-guard";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import { api, ApiError } from "#/lib/api";
import type { DataStatus, IngestionFlag } from "#/lib/types";

export const Route = createFileRoute("/upload")({
  component: () => (
    <AuthGuard>
      <UploadPage />
    </AuthGuard>
  ),
});

type Phase = "idle" | "uploading" | "screened" | "error";

function UploadPage() {
  const navigate = useNavigate();
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [paymentsFile, setPaymentsFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState<IngestionFlag[]>([]);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    refreshStatus();
  }, []);

  async function refreshStatus() {
    try {
      setStatus(await api.get<DataStatus>("/api/data/status"));
    } catch {
      // non-fatal; status panel just stays empty
    }
  }

  async function refreshFlags() {
    const { flags } = await api.get<{ flags: IngestionFlag[] }>("/api/ingest/flags");
    setFlags(flags);
  }

  async function handleUpload() {
    if (!ordersFile || !paymentsFile) {
      setError("Select both an orders CSV and a payments CSV.");
      return;
    }
    setError(null);
    setPhase("uploading");
    try {
      const [ordersText, paymentsText] = await Promise.all([ordersFile.text(), paymentsFile.text()]);
      await api.postCsv("/api/ingest/orders", ordersText);
      await api.postCsv("/api/ingest/payments", paymentsText);
      await api.post("/api/ingest/check");
      await refreshFlags();
      await refreshStatus();
      setPhase("screened");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed. Check the files and try again.");
      setPhase("error");
    }
  }

  async function actOnFlag(id: string, action: "acknowledge" | "exclude") {
    await api.post(`/api/ingest/flags/${id}/${action}`);
    await refreshFlags();
  }

  async function handleClear() {
    if (!confirm("Clear all uploaded orders, payments, flags, and reconciliation results?")) return;
    await api.del("/api/data");
    setFlags([]);
    setPhase("idle");
    await refreshStatus();
  }

  async function runReconciliation() {
    setReconciling(true);
    try {
      await api.post("/api/reconcile/run");
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reconciliation failed to run.");
    } finally {
      setReconciling(false);
    }
  }

  const grouped = groupByType(flags);
  const hasData = (status?.orders.count ?? 0) > 0 || (status?.payments.count ?? 0) > 0;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Upload data</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload your orders and payments exports. Not sure of the format? Download a sample below.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Current data</CardTitle>
        </CardHeader>
        <CardContent>
          {status ? (
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex gap-6">
                <Stat label="Orders" value={status.orders.count} />
                <Stat label="Payments" value={status.payments.count} />
                <Stat label="Reconciled rows" value={status.reconciliations.count} />
              </div>
              {hasData && (
                <Button variant="destructive" size="sm" onClick={handleClear}>
                  Clear data
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Upload CSVs</CardTitle>
          <CardDescription>
            Need the format?{" "}
            <a href="/sample-orders.csv" download className="underline underline-offset-4">
              sample orders.csv
            </a>{" "}
            ·{" "}
            <a href="/sample-payments.csv" download className="underline underline-offset-4">
              sample payments.csv
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FileField label="orders.csv" file={ordersFile} onChange={setOrdersFile} />
          <FileField label="payments.csv" file={paymentsFile} onChange={setPaymentsFile} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleUpload} disabled={phase === "uploading"}>
            {phase === "uploading" ? "Uploading…" : "Upload & screen"}
          </Button>
        </CardContent>
      </Card>

      {flags.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Screening report</CardTitle>
            <CardDescription>
              {flags.length} issue{flags.length === 1 ? "" : "s"} found. These are informational — reconciliation
              will run regardless, but you can acknowledge or exclude any row.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {Object.entries(grouped).map(([type, group]) => (
              <div key={type} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={group[0].severity === "warning" ? "warning" : "secondary"}>{type}</Badge>
                  <span className="text-sm text-muted-foreground">{group.length}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {group.map((flag) => (
                    <li key={flag.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {flag.source} · {flag.rowRef ?? "—"} ·{" "}
                        <code className="text-xs">{JSON.stringify(flag.details)}</code>
                      </span>
                      {flag.resolutionStatus === "open" ? (
                        <span className="flex shrink-0 gap-1">
                          <Button size="sm" variant="outline" onClick={() => actOnFlag(flag.id, "acknowledge")}>
                            Acknowledge
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => actOnFlag(flag.id, "exclude")}>
                            Exclude
                          </Button>
                        </span>
                      ) : (
                        <Badge variant="outline" className="shrink-0">
                          {flag.resolutionStatus}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(phase === "screened" || hasData) && (
        <div className="mt-6 flex justify-end">
          <Button onClick={runReconciliation} disabled={reconciling}>
            {reconciling ? "Running…" : "Run reconciliation"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value}</div>
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
        className="text-sm"
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
