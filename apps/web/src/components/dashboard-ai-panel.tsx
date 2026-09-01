import { useEffect, useState } from "react";
import { RefreshCcw, Sparkles } from "lucide-react";
import { Card } from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { ChatPanel } from "#/components/chat-panel";
import { api, ApiError } from "#/lib/api";
import type { Explanation } from "#/lib/types";

export function DashboardAiPanel() {
  const [insight, setInsight] = useState<Explanation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<{ insight: Explanation | null }>("/api/dashboard/insight")
      .then((res) => setInsight(res.insight))
      .finally(() => setLoaded(true));
  }, []);

  async function generate() {
    setState("loading");
    setError(null);
    try {
      const res = await api.post<{ insight: Explanation }>("/api/dashboard/insight");
      setInsight(res.insight);
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
    }
  }

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden py-0">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-chart-1" />
          AI insight
        </div>
        {insight && (
          <Button size="icon-sm" variant="ghost" onClick={generate} disabled={state === "loading"} title="Regenerate">
            <RefreshCcw className={state === "loading" ? "animate-spin" : undefined} />
          </Button>
        )}
      </div>

      <div className="shrink-0 border-b px-4 py-3">
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : state === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Asking the LLM…
          </div>
        ) : state === "error" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={generate}>
              Retry
            </Button>
          </div>
        ) : insight ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-sm leading-relaxed">{insight.likely_cause}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{insight.recommended_action}</p>
            {insight.suggested_actions && insight.suggested_actions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {insight.suggested_actions.map((action, i) => (
                  <Badge key={i} variant="secondary" className="h-auto w-full min-w-0 justify-start py-1 text-left font-normal">
                    <Sparkles className="shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 text-wrap">{action}</span>
                  </Badge>
                ))}
              </div>
            )}
            <Badge variant="outline" className="w-fit capitalize">
              Confidence: {insight.confidence}
            </Badge>
          </div>
        ) : (
          <Button size="sm" onClick={generate}>
            <Sparkles /> Generate insight
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 p-3">
        <ChatPanel endpoint="/api/dashboard/chat" placeholder='Ask about your data — e.g. "which discrepancy has the biggest dollar impact?"' />
      </div>
    </Card>
  );
}
