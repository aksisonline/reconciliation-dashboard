import { Check } from "lucide-react";
import { Spinner } from "#/components/ui/spinner";
import { TOOL_LABELS, type ToolCall } from "#/lib/agent-steps";

/** Live "what the agent is doing right now" checklist — tool calls as they happen, then a
 * closing shimmer line while the model turns tool results into a final answer. Used for both
 * chat replies and Explain/insight generation so slow requests (there's a lot of data to work
 * through) read as active progress instead of a stuck spinner. */
export function AgentProgress({
  calls,
  compiling,
  finishedLabel = "Writing reply…",
}: {
  calls: ToolCall[];
  compiling: boolean;
  finishedLabel?: string;
}) {
  if (calls.length === 0 && !compiling) {
    return <span className="shimmer text-sm">Thinking…</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {calls.map((c, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
          {c.done ? (
            <Check className="size-3 shrink-0 text-chart-2" />
          ) : (
            <Spinner className="size-3 shrink-0" />
          )}
          <span>{TOOL_LABELS[c.name] ?? `Calling ${c.name}`}</span>
        </div>
      ))}
      {(compiling || calls.every((c) => c.done)) && (
        <span className="shimmer text-sm">{compiling ? "Compiling…" : finishedLabel}</span>
      )}
    </div>
  );
}
