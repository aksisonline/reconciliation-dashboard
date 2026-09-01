import { useState } from "react";

/** Friendly labels for the backend's tool names — shown live as the agent works instead of a
 * static "Thinking…" spinner, so a slow reply (there's a lot of data to page through) reads as
 * progress rather than the UI being stuck. */
export const TOOL_LABELS: Record<string, string> = {
  getDiscrepancy: "Looking up the discrepancy",
  getDiscrepanciesByType: "Pulling discrepancies by type",
  getSummaryTotals: "Calculating summary totals",
  compareAmounts: "Comparing amounts",
};

export type StepEvent =
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "compiling" };

export type ToolCall = { name: string; done: boolean };

/** Tracks the live tool-call checklist for one in-flight agent request (chat reply or an
 * Explain/insight generation) as `step` SSE events arrive. Shared so the chat bubble and the
 * insight-generation state render the exact same progress UI. */
export function useAgentSteps() {
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [compiling, setCompiling] = useState(false);

  function handle(step: StepEvent) {
    if (step.type === "tool_call") {
      setCalls((prev) => [...prev, { name: step.name, done: false }]);
    } else if (step.type === "tool_result") {
      setCalls((prev) => {
        let idx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].name === step.name && !prev[i].done) {
            idx = i;
            break;
          }
        }
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], done: true };
        return next;
      });
    } else if (step.type === "compiling") {
      setCompiling(true);
    }
  }

  function reset() {
    setCalls([]);
    setCompiling(false);
  }

  return { calls, compiling, handle, reset };
}
