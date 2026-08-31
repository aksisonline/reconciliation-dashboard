import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Table, TableBody, TableCell, TableRow } from "#/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "#/components/ui/alert";
import { Spinner } from "#/components/ui/spinner";
import { DiscrepancyChat } from "#/components/discrepancy-chat";
import { api, ApiError } from "#/lib/api";
import { buildDiffRows } from "#/lib/diff";
import { DISCREPANCY_COPY } from "#/lib/copy";
import type { Discrepancy, Explanation } from "#/lib/types";

export function DiscrepancySheet({
  discrepancy,
  onOpenChange,
}: {
  discrepancy: Discrepancy | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explainState, setExplainState] = useState<"idle" | "loading" | "error">("idle");
  const [explainError, setExplainError] = useState<string | null>(null);

  async function explain(id: string) {
    setExplainState("loading");
    setExplainError(null);
    try {
      const res = await api.post<{ explanation: Explanation }>(`/api/discrepancies/${id}/explain`);
      setExplanation(res.explanation);
      setExplainState("idle");
    } catch (err) {
      setExplainState("error");
      setExplainError(err instanceof ApiError ? err.message : "Explanation unavailable right now.");
    }
  }

  return (
    <Sheet
      open={!!discrepancy}
      onOpenChange={(open) => {
        if (!open) {
          setExplanation(null);
          setExplainState("idle");
        }
        onOpenChange(open);
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        {discrepancy && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">
                  {discrepancy.discrepancyType ? DISCREPANCY_COPY[discrepancy.discrepancyType].label : "Discrepancy"}
                </Badge>
                <span className="text-sm font-medium tabular-nums">
                  {Number(discrepancy.amountAtRisk).toLocaleString(undefined, { style: "currency", currency: "USD" })}{" "}
                  at risk
                </span>
              </div>
              <SheetTitle className="sr-only">Discrepancy detail</SheetTitle>
              <SheetDescription>
                {discrepancy.discrepancyType ? DISCREPANCY_COPY[discrepancy.discrepancyType].description : ""}
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col px-4">
              <TabsList className="w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="discuss">Discuss</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="flex flex-col gap-4 overflow-y-auto pb-4">
                <Table>
                  <TableBody>
                    {buildDiffRows(discrepancy.order, discrepancy.payment).map((row) => (
                      <TableRow key={row.label}>
                        <TableCell className="w-24 font-medium text-muted-foreground">{row.label}</TableCell>
                        <TableCell className={row.mismatch ? "text-destructive" : undefined}>{row.order}</TableCell>
                        <TableCell className={row.mismatch ? "text-destructive" : undefined}>{row.payment}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {!explanation && explainState !== "loading" && explainState !== "error" && (
                  <Button onClick={() => explain(discrepancy.id)}>
                    <Sparkles /> Explain this discrepancy
                  </Button>
                )}
                {explainState === "loading" && (
                  <Alert>
                    <Spinner />
                    <AlertTitle>Asking the LLM…</AlertTitle>
                  </Alert>
                )}
                {explainState === "error" && (
                  <Alert variant="destructive">
                    <AlertTitle>Couldn't generate an explanation</AlertTitle>
                    <AlertDescription className="flex items-center justify-between gap-2">
                      {explainError}
                      <Button size="sm" variant="outline" onClick={() => explain(discrepancy.id)}>
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                {explanation && (
                  <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
                    <p>
                      <span className="font-medium">Likely cause: </span>
                      {explanation.likely_cause}
                    </p>
                    <p>
                      <span className="font-medium">Recommended action: </span>
                      {explanation.recommended_action}
                    </p>
                    <Badge variant="outline" className="w-fit capitalize">
                      Confidence: {explanation.confidence}
                    </Badge>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="discuss" className="min-h-0 flex-1 pb-4">
                <DiscrepancyChat reconciliationId={discrepancy.id} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
