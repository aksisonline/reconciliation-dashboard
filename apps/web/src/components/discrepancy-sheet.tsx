import { useRef, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
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
import { AgentProgress } from "#/components/agent-progress";
import { ChatPanel, type ChatPanelHandle } from "#/components/chat-panel";
import { useAgentSteps, type StepEvent } from "#/lib/agent-steps";
import { ApiError, postSSE } from "#/lib/api";
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
  const [tab, setTab] = useState("overview");
  const chatRef = useRef<ChatPanelHandle>(null);
  const { calls, compiling, handle: handleStep, reset: resetSteps } = useAgentSteps();

  async function requestExplanation(id: string): Promise<Explanation> {
    let got: Explanation | null = null;
    for await (const evt of postSSE(`/api/discrepancies/${id}/explain`, undefined)) {
      if (evt.event === "step") {
        handleStep(JSON.parse(evt.data) as StepEvent);
      } else if (evt.event === "final") {
        got = (JSON.parse(evt.data) as { explanation: Explanation }).explanation;
      } else if (evt.event === "error") {
        throw new ApiError(502, (JSON.parse(evt.data) as { error: string }).error);
      }
    }
    if (!got) throw new Error("No explanation returned");
    return got;
  }

  async function explain(id: string) {
    setExplainState("loading");
    setExplainError(null);
    resetSteps();
    try {
      setExplanation(await requestExplanation(id));
      setExplainState("idle");
    } catch (err) {
      // The call can outlast an edge proxy's own timeout even though it
      // finished server-side; a second attempt is cheap since it hits the cache.
      try {
        resetSteps();
        setExplanation(await requestExplanation(id));
        setExplainState("idle");
        return;
      } catch {
        // fall through to the original error below
      }
      setExplainState("error");
      setExplainError(err instanceof ApiError ? err.message : "Explanation unavailable right now.");
    } finally {
      resetSteps();
    }
  }

  function askAbout(action: string) {
    setTab("discuss");
    // Give the tab a tick to mount the Discuss ChatPanel before sending.
    setTimeout(() => chatRef.current?.sendMessage(`How do I: ${action}`), 0);
  }

  return (
    <Sheet
      open={!!discrepancy}
      onOpenChange={(open) => {
        if (!open) {
          setExplanation(null);
          setExplainState("idle");
          setTab("overview");
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

            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col px-4">
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
                    <Sparkles />
                    <AlertTitle>Generating explanation…</AlertTitle>
                    <AlertDescription>
                      <AgentProgress calls={calls} compiling={compiling} finishedLabel="Writing explanation…" />
                    </AlertDescription>
                  </Alert>
                )}
                {explainState === "error" && (
                  <Alert variant="destructive">
                    <AlertTitle>Couldn't generate an explanation</AlertTitle>
                    <AlertDescription className="flex items-center justify-between gap-2">
                      {explainError}
                      <Button size="sm" variant="outline" onClick={() => explain(discrepancy.id)}>
                        <RotateCcw /> Try again
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
                            <button
                              key={i}
                              type="button"
                              onClick={() => askAbout(action)}
                              className="w-full text-left"
                              title="Ask about this in Discuss"
                            >
                              <Badge
                                variant="secondary"
                                className="h-auto w-full min-w-0 cursor-pointer justify-start py-1 text-left font-normal transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_8%)]"
                              >
                                <Sparkles className="shrink-0 opacity-60" />
                                <span className="min-w-0 flex-1 text-wrap">{action}</span>
                              </Badge>
                            </button>
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
                  ref={chatRef}
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
