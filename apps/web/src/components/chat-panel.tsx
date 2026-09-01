import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { MessageCircleDashedIcon, RotateCcw, Send } from "lucide-react";
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "#/components/ui/empty";
import { AgentProgress } from "#/components/agent-progress";
import { useAgentSteps, type StepEvent } from "#/lib/agent-steps";
import { api, ApiError, postSSE } from "#/lib/api";
import type { ChatMessage } from "#/lib/types";

export type ChatPanelHandle = { sendMessage: (content: string) => void };

/** Generic "ask a question, get a reply" chat panel — used for both the per-discrepancy
 * Discuss tab and the dashboard-level "ask about your data" chat. `endpoint` is the base
 * path; `${endpoint}/messages` is fetched/posted to. `leading`, when given, renders as the
 * first bubble in the same scrolling feed (used to fold the dashboard's AI insight into the
 * chat itself instead of showing it in a separate boxed-off section). `emptyAction`, when
 * given, renders as a centered call-to-action in the empty state (before there's anything to
 * scroll) instead of `leading` sitting awkwardly at the top of an otherwise blank feed. A ref
 * exposes `sendMessage` so a parent (e.g. a clickable suggested-action chip) can drive it. */
export const ChatPanel = forwardRef<
  ChatPanelHandle,
  { endpoint: string; placeholder: string; leading?: ReactNode; emptyAction?: ReactNode }
>(function ChatPanel({ endpoint, placeholder, leading, emptyAction }, ref) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedContent, setFailedContent] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { calls, compiling, handle: handleStep, reset: resetSteps } = useAgentSteps();

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

  async function send(overrideContent?: string) {
    const content = (overrideContent ?? draft).trim();
    if (!content || sending) return;
    if (!overrideContent) setDraft("");
    setError(null);
    setFailedContent(null);
    setSending(true);
    resetSteps();
    // A retry reuses the same pending user bubble that's already on screen rather than
    // adding a second copy of it.
    setMessages((prev) =>
      overrideContent && prev.at(-1)?.id.startsWith("pending-")
        ? prev
        : [...prev, { id: `pending-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() }],
    );

    try {
      for await (const evt of postSSE(`${endpoint}/messages`, { content })) {
        if (evt.event === "step") {
          handleStep(JSON.parse(evt.data) as StepEvent);
        } else if (evt.event === "final") {
          const { message } = JSON.parse(evt.data) as { message: ChatMessage };
          setMessages((prev) => [...prev, message]);
        } else if (evt.event === "error") {
          const { error: msg } = JSON.parse(evt.data) as { error: string };
          setError(msg || "Couldn't get a reply.");
          setFailedContent(content);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't get a reply.");
      setFailedContent(content);
    } finally {
      setSending(false);
      resetSteps();
      inputRef.current?.focus();
    }
  }

  useImperativeHandle(ref, () => ({ sendMessage: (content: string) => send(content) }));

  // A `leading` bubble (the dashboard's AI insight) counts as content on its own, so the
  // empty state only shows when there's truly nothing yet — no messages, and either no
  // leading content or an explicit emptyAction (a "Generate insight" opener) to show instead.
  const isEmptyOfMessages = loaded && messages.length === 0 && !sending;
  const showEmptyState = isEmptyOfMessages && (!!emptyAction || !leading);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {showEmptyState ? (
        <Empty className="min-h-0 flex-1 border-none p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageCircleDashedIcon />
            </EmptyMedia>
            <EmptyDescription>{placeholder}</EmptyDescription>
          </EmptyHeader>
          {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
        </Empty>
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              {/* A fixed reading-width column, centered — Bubble caps at 80% of its parent, so on a
                  very wide parent (the panel expanded to near-fullscreen) an unconstrained parent
                  left bubbles pinned to the left edge with a large empty gap on the right. */}
              {/* pb-8 gives the bottom scroll-fade mask (a permanent ~2rem faded band at the
                  viewport's bottom edge, not just while scrolling) empty space to fade into —
                  without it, that band fades straight into the last message's own text and
                  there's nothing left to scroll to reveal it. */}
              <MessageScrollerContent className="mx-auto w-full max-w-3xl pb-8">
                {leading && (
                  <MessageScrollerItem>
                    <Message align="start">
                      <MessageContent>
                        <Bubble align="start" variant="muted">
                          <BubbleContent>{leading}</BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )}
                {!loaded ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading conversation…</p>
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
                          <BubbleContent>
                            <AgentProgress calls={calls} compiling={compiling} />
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
      )}

      {error && (
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2">
          <p className="text-xs text-destructive">{error}</p>
          {failedContent && (
            <Button size="sm" variant="outline" onClick={() => send(failedContent)}>
              <RotateCcw /> Try again
            </Button>
          )}
        </div>
      )}

      <form
        className="mx-auto flex w-full max-w-3xl gap-2"
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
});
