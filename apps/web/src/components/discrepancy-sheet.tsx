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
import { ChatPanel } from "#/components/chat-panel";
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
      // The call can outlast an edge proxy's own timeout even though it
      // finished server-side; a retry is cheap since it hits the cache.
      try {
        const retry = await api.post<{ explanation: Explanation }>(`/api/discrepancies/${id}/explain`);
        setExplanation(retry.explanation);
        setExplainState("idle");
        return;
      } catch {
        // fall through to the original error below
      }
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
                    {explanation.suggested_actions && explanation.suggested_actions.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Suggested next steps</span>
                        <div className="flex flex-col gap-1.5">
                          {explanation.suggested_actions.map((action, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="h-auto w-full min-w-0 justify-start py-1 text-left font-normal"
                            >
                              <Sparkles className="shrink-0 opacity-60" />
                              <span className="min-w-0 flex-1 text-wrap">{action}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <Badge variant="outline" className="w-fit capitalize">
                      Confidence: {explanation.confidence}
                    </Badge>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="discuss" className="min-h-0 flex-1 overflow-hidden pb-4">
                <ChatPanel
                  endpoint={`/api/discrepancies/${discrepancy.id}`}
                  placeholder='Ask a follow-up — e.g. "what should I tell the customer" or "how does this compare to similar cases".'
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
