import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { asc, count, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import * as schema from "../db/schema";
import { explainWithFallback, dashboardChatReply, type ChatTurn } from "../lib/llm/agent";
import { renderMarkdown } from "../lib/markdown";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get("/summary", async (c) => {
  const userId = c.get("userId");

  const summary = await withUserContext(userId, async (tx) => {
    const [{ value: totalOrders }] = await tx
      .select({ value: count() })
      .from(schema.orders)
      .where(eq(schema.orders.userId, userId));

    const [{ value: totalPayments }] = await tx
      .select({ value: count() })
      .from(schema.payments)
      .where(eq(schema.payments.userId, userId));

    const recs = await tx
      .select({
        status: schema.reconciliations.status,
        discrepancyType: schema.reconciliations.discrepancyType,
        amountAtRisk: schema.reconciliations.amountAtRisk,
        orderNetAmount: schema.orders.netAmount,
        paymentAmount: schema.payments.amount,
      })
      .from(schema.reconciliations)
      .leftJoin(schema.orders, eq(schema.reconciliations.orderRowId, schema.orders.id))
      .leftJoin(schema.payments, eq(schema.reconciliations.paymentRowId, schema.payments.id))
      .where(eq(schema.reconciliations.userId, userId));

    let valueReconciled = 0;
    let valueInDispute = 0;
    let moneyAtRisk = 0;
    const byType: Record<string, { count: number; amountAtRisk: number }> = {};

    for (const r of recs) {
      const txValue = Number(r.orderNetAmount ?? r.paymentAmount ?? 0);
      if (r.status === "matched") {
        valueReconciled += txValue;
      } else {
        valueInDispute += txValue;
        moneyAtRisk += Number(r.amountAtRisk ?? 0);
        if (r.discrepancyType) {
          const entry = byType[r.discrepancyType] ?? { count: 0, amountAtRisk: 0 };
          entry.count += 1;
          entry.amountAtRisk += Number(r.amountAtRisk ?? 0);
          byType[r.discrepancyType] = entry;
        }
      }
    }

    return {
      totalOrders,
      totalPayments,
      totalReconciliations: recs.length,
      valueReconciled: round2(valueReconciled),
      valueInDispute: round2(valueInDispute),
      moneyAtRisk: round2(moneyAtRisk),
      byType,
    };
  });

  return c.json(summary);
});

function round2(n: number) {
  return Number(n.toFixed(2));
}

const INSIGHT_QUESTION =
  "Summarize this user's whole reconciliation for a revenue owner. Call getSummaryTotals exactly once — it " +
  "already includes a byType breakdown with both count and amountAtRisk per discrepancy type, which is " +
  "everything you need; do not call getDiscrepanciesByType or getDiscrepancy for this. Call out the " +
  "highest-impact discrepancy types by dollar amount, not just count, and give suggested next steps that " +
  "apply across the reconciliation as a whole (not one single row).";

dashboardRoutes.get("/insight", async (c) => {
  const userId = c.get("userId");
  const [row] = await withUserContext(userId, (tx) =>
    tx.select().from(schema.dashboardInsights).where(eq(schema.dashboardInsights.userId, userId)),
  );
  return c.json({ insight: row ? row.structured : null, createdAt: row?.createdAt ?? null });
});

dashboardRoutes.post("/insight", async (c) => {
  const userId = c.get("userId");

  return streamSSE(c, async (stream) => {
    const result = await withUserContext(userId, (tx) =>
      explainWithFallback(tx, userId, INSIGHT_QUESTION, (step) =>
        stream.writeSSE({ event: "step", data: JSON.stringify(step) }),
      ),
    );

    if (!result.ok) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ error: result.error }) });
      return;
    }

    await withUserContext(userId, async (tx) => {
      await tx.delete(schema.dashboardInsights).where(eq(schema.dashboardInsights.userId, userId));
      await tx.insert(schema.dashboardInsights).values({
        userId,
        structured: result.explanation,
        model: process.env.LLM_MODEL ?? "unknown",
      });
    });

    await stream.writeSSE({
      event: "final",
      data: JSON.stringify({ insight: result.explanation, createdAt: new Date().toISOString() }),
    });
  });
});

dashboardRoutes.get("/chat/messages", async (c) => {
  const userId = c.get("userId");
  const messages = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(schema.dashboardChatMessages)
      .where(eq(schema.dashboardChatMessages.userId, userId))
      .orderBy(asc(schema.dashboardChatMessages.createdAt)),
  );
  return c.json({ messages: messages.map((m) => ({ ...m, contentHtml: renderMarkdown(m.content) })) });
});

dashboardRoutes.post("/chat/messages", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ content: string }>().catch(() => null);
  const content = body?.content?.trim();
  if (!content) return c.json({ error: "content required" }, 400);

  const history = await withUserContext(userId, async (tx) => {
    const prior = await tx
      .select()
      .from(schema.dashboardChatMessages)
      .where(eq(schema.dashboardChatMessages.userId, userId))
      .orderBy(asc(schema.dashboardChatMessages.createdAt));

    await tx.insert(schema.dashboardChatMessages).values({ userId, role: "user", content });

    return prior.map((m): ChatTurn => ({ role: m.role, content: m.content }));
  });

  return streamSSE(c, async (stream) => {
    const result = await withUserContext(userId, (tx) =>
      dashboardChatReply(tx, userId, [...history, { role: "user", content }], (step) =>
        stream.writeSSE({ event: "step", data: JSON.stringify(step) }),
      ),
    );

    if (!result.ok) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ error: result.error }) });
      return;
    }

    const [saved] = await withUserContext(userId, (tx) =>
      tx
        .insert(schema.dashboardChatMessages)
        .values({ userId, role: "assistant", content: result.reply })
        .returning(),
    );

    await stream.writeSSE({
      event: "final",
      data: JSON.stringify({ message: { ...saved, contentHtml: renderMarkdown(saved.content) } }),
    });
  });
});
