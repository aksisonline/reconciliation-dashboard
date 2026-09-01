import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, RefreshCcw, Sparkles } from "lucide-react";
import { Card } from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { AgentProgress } from "#/components/agent-progress";
import { ChatPanel, type ChatPanelHandle } from "#/components/chat-panel";
import { useAgentSteps, type StepEvent } from "#/lib/agent-steps";
import { api, ApiError, postSSE } from "#/lib/api";
import { cn } from "#/lib/utils";
import type { Explanation } from "#/lib/types";

export function DashboardAiPanel() {
  const [insight, setInsight] = useState<Explanation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chatRef = useRef<ChatPanelHandle>(null);
  const { calls, compiling, handle: handleStep, reset: resetSteps } = useAgentSteps();

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    api
      .get<{ insight: Explanation | null }>("/api/dashboard/insight")
      .then((res) => setInsight(res.insight))
      .finally(() => setLoaded(true));
  }, []);

  async function generate() {
    setState("loading");
    setError(null);
    resetSteps();
    try {
      let got: Explanation | null = null;
      for await (const evt of postSSE("/api/dashboard/insight", undefined)) {
        if (evt.event === "step") {
          handleStep(JSON.parse(evt.data) as StepEvent);
        } else if (evt.event === "final") {
          got = (JSON.parse(evt.data) as { insight: Explanation }).insight;
        } else if (evt.event === "error") {
          throw new ApiError(502, (JSON.parse(evt.data) as { error: string }).error);
        }
      }
      if (!got) throw new Error("No insight returned");
      setInsight(got);
      setState("idle");
    } catch (err) {
      // The generation call can be slower than an edge proxy's own timeout —
      // it may have actually finished server-side even though this request
      // failed. Check before showing an error the user would have to retry.
      try {
        const check = await api.get<{ insight: Explanation | null }>("/api/dashboard/insight");
        if (check.insight) {
          setInsight(check.insight);
          setState("idle");
          return;
        }
      } catch {
        // fall through to the original error below
      }
      setState("error");
      setError(err instanceof ApiError ? err.message : "Couldn't generate an insight right now.");
    } finally {
      resetSteps();
    }
  }

  const noInsightYet = loaded && !insight && state === "idle";
  const generateButton = (
    <Button size="sm" onClick={generate}>
      <Sparkles /> Generate insight
    </Button>
  );

  // Rendered as the first bubble in the chat feed itself (see ChatPanel's `leading` prop) —
  // one continuous conversation instead of a boxed-off "insight" section above a divider.
  // The "no insight yet" case is the exception: it's handed to `emptyAction` instead, so it
  // shows as a centered opener on the blank chat rather than a bubble pinned to the top —
  // this fallback only appears if the user starts chatting before generating one.
  const insightBubble = noInsightYet ? (
    generateButton
  ) : !loaded ? (
    <span className="text-sm text-muted-foreground">Loading…</span>
  ) : state === "loading" ? (
    <AgentProgress calls={calls} compiling={compiling} finishedLabel="Writing insight…" />
  ) : state === "error" ? (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-destructive">{error}</p>
      <Button size="sm" variant="outline" className="w-fit" onClick={generate}>
        Try again
      </Button>
    </div>
  ) : (
    insight && (
      <div className="flex flex-col gap-2.5">
        <p className="text-sm leading-relaxed">{insight.likely_cause}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{insight.recommended_action}</p>
        {insight.suggested_actions && insight.suggested_actions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {insight.suggested_actions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => chatRef.current?.sendMessage(`How do I: ${action}`)}
                className="w-full text-left"
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
        )}
        <Badge variant="outline" className="w-fit capitalize">
          Confidence: {insight.confidence}
        </Badge>
      </div>
    )
  );

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}
      <Card
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden py-0",
          expanded && "fixed inset-4 z-50 shadow-2xl md:inset-10",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-chart-1" />
            AI insight
          </div>
          <div className="flex items-center gap-1">
            {insight && (
              <Button size="icon-sm" variant="ghost" onClick={generate} disabled={state === "loading"} title="Regenerate">
                <RefreshCcw className={state === "loading" ? "animate-spin" : undefined} />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? "Minimize" : "Expand"}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <ChatPanel
            ref={chatRef}
            endpoint="/api/dashboard/chat"
            placeholder='Ask about your data — e.g. "which discrepancy has the biggest dollar impact?"'
            leading={insightBubble}
            emptyAction={noInsightYet ? generateButton : undefined}
          />
        </div>
      </Card>
    </>
  );
}
