import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, asc, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import * as schema from "../db/schema";
import { chatReply, type ChatTurn } from "../lib/llm/agent";
import { renderMarkdown } from "../lib/markdown";

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.get("/:id/messages", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const messages = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(schema.discrepancyChatMessages)
      .where(
        and(
          eq(schema.discrepancyChatMessages.reconciliationId, id),
          eq(schema.discrepancyChatMessages.userId, userId),
        ),
      )
      .orderBy(asc(schema.discrepancyChatMessages.createdAt)),
  );

  return c.json({ messages: messages.map((m) => ({ ...m, contentHtml: renderMarkdown(m.content) })) });
});

chatRoutes.post("/:id/messages", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json<{ content: string }>().catch(() => null);
  const content = body?.content?.trim();
  if (!content) return c.json({ error: "content required" }, 400);

  const history = await withUserContext(userId, async (tx) => {
    const [reconciliation] = await tx
      .select({ id: schema.reconciliations.id })
      .from(schema.reconciliations)
      .where(and(eq(schema.reconciliations.id, id), eq(schema.reconciliations.userId, userId)));
    if (!reconciliation) return null;

    const prior = await tx
      .select()
      .from(schema.discrepancyChatMessages)
      .where(
        and(
          eq(schema.discrepancyChatMessages.reconciliationId, id),
          eq(schema.discrepancyChatMessages.userId, userId),
        ),
      )
      .orderBy(asc(schema.discrepancyChatMessages.createdAt));

    await tx.insert(schema.discrepancyChatMessages).values({
      userId,
      reconciliationId: id,
      role: "user",
      content,
    });

    return prior.map((m): ChatTurn => ({ role: m.role, content: m.content }));
  });

  if (history === null) return c.json({ error: "Not found" }, 404);

  return streamSSE(c, async (stream) => {
    const result = await withUserContext(userId, (tx) =>
      chatReply(tx, userId, id, [...history, { role: "user", content }], (step) =>
        stream.writeSSE({ event: "step", data: JSON.stringify(step) }),
      ),
    );

    if (!result.ok) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ error: result.error }) });
      return;
    }

    const [saved] = await withUserContext(userId, (tx) =>
      tx
        .insert(schema.discrepancyChatMessages)
        .values({ userId, reconciliationId: id, role: "assistant", content: result.reply })
        .returning(),
    );

    await stream.writeSSE({
      event: "final",
      data: JSON.stringify({ message: { ...saved, contentHtml: renderMarkdown(saved.content) } }),
    });
  });
});
