import { useEffect, useRef, useState } from "react";
import { Check, Send } from "lucide-react";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { Message, MessageContent } from "#/components/ui/message";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Input } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { api, ApiError, postSSE } from "#/lib/api";
import type { ChatMessage } from "#/lib/types";

const TOOL_LABELS: Record<string, string> = {
  getDiscrepancy: "Looking up the discrepancy",
  getDiscrepanciesByType: "Pulling discrepancies by type",
  getSummaryTotals: "Calculating summary totals",
  compareAmounts: "Comparing amounts",
};

type ToolCall = { name: string; done: boolean };

/** Generic "ask a question, get a reply" chat panel — used for both the per-discrepancy
 * Discuss tab and the dashboard-level "ask about your data" chat. `endpoint` is the base
 * path; `${endpoint}/messages` is fetched/posted to. */
export function ChatPanel({ endpoint, placeholder }: { endpoint: string; placeholder: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ messages: ChatMessage[] }>(`${endpoint}/messages`)
      .then((res) => !cancelled && setMessages(res.messages))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    setError(null);
    setSending(true);
    setCalls([]);
    setMessages((prev) => [
      ...prev,
      { id: `pending-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() },
    ]);

    try {
      for await (const evt of postSSE(`${endpoint}/messages`, { content })) {
        if (evt.event === "step") {
          const step = JSON.parse(evt.data) as { type: "tool_call" | "tool_result"; name: string };
          if (step.type === "tool_call") {
            setCalls((prev) => [...prev, { name: step.name, done: false }]);
          } else {
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
          }
        } else if (evt.event === "final") {
          const { message } = JSON.parse(evt.data) as { message: ChatMessage };
          setMessages((prev) => [...prev, message]);
        } else if (evt.event === "error") {
          const { error: msg } = JSON.parse(evt.data) as { error: string };
          setError(msg || "Couldn't get a reply. Try again.");
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't get a reply. Try again.");
    } finally {
      setSending(false);
      setCalls([]);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {!loaded ? (
                <p className="p-4 text-sm text-muted-foreground">Loading conversation…</p>
              ) : messages.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{placeholder}</p>
              ) : (
                messages.map((m) => (
                  <MessageScrollerItem key={m.id}>
                    <Message align={m.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        <Bubble
                          align={m.role === "user" ? "end" : "start"}
                          variant={m.role === "user" ? "default" : "muted"}
                        >
                          {m.contentHtml ? (
                            <BubbleContent
                              className="chat-markdown"
                              dangerouslySetInnerHTML={{ __html: m.contentHtml }}
                            />
                          ) : (
                            <BubbleContent className="whitespace-pre-wrap">{m.content}</BubbleContent>
                          )}
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))
              )}
              {sending && (
                <MessageScrollerItem>
                  <Message align="start">
                    <MessageContent>
                      <Bubble align="start" variant="muted">
                        <BubbleContent className="flex flex-col gap-1.5">
                          {calls.length === 0 ? (
                            <span className="shimmer text-sm">Thinking…</span>
                          ) : (
                            <>
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
                              {calls.every((c) => c.done) && (
                                <span className="shimmer text-sm">Writing reply…</span>
                              )}
                            </>
                          )}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a follow-up…"
          disabled={sending}
        />
        <Button type="submit" size="icon" disabled={sending || !draft.trim()}>
          <Send />
        </Button>
      </form>
    </div>
  );
}
