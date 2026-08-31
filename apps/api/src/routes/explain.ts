import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import * as schema from "../db/schema";
import { explainWithFallback } from "../lib/llm/agent";

export const explainRoutes = new Hono<AppEnv>();

explainRoutes.post("/:id/explain", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const cached = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(schema.discrepancyExplanations)
      .where(
        and(
          eq(schema.discrepancyExplanations.reconciliationId, id),
          eq(schema.discrepancyExplanations.userId, userId),
        ),
      ),
  );
  if (cached.length > 0) return c.json({ explanation: cached[0].structured, cached: true });

  const result = await withUserContext(userId, (tx) =>
    explainWithFallback(tx, userId, `Explain reconciliation discrepancy with id ${id}. Call getDiscrepancy first.`),
  );

  if (!result.ok) {
    return c.json({ error: "explanation_unavailable", detail: result.error }, 502);
  }

  await withUserContext(userId, (tx) =>
    tx.insert(schema.discrepancyExplanations).values({
      userId,
      reconciliationId: id,
      explanationText: `${result.explanation.likely_cause} ${result.explanation.recommended_action}`,
      structured: result.explanation,
      model: process.env.LLM_MODEL ?? "unknown",
    }),
  );

  return c.json({ explanation: result.explanation, cached: false });
});

explainRoutes.post("/explain-batch", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ ids: string[] }>().catch(() => null);
  if (!body?.ids?.length) return c.json({ error: "ids required" }, 400);

  const idList = body.ids.filter((id): id is string => typeof id === "string").slice(0, 20);

  const result = await withUserContext(userId, (tx) =>
    explainWithFallback(
      tx,
      userId,
      `Explain the set of discrepancies with ids: ${idList.join(", ")}. Summarize what likely happened across all of them and what to do about it. Use getDiscrepancy for each id.`,
    ),
  );

  if (!result.ok) {
    return c.json({ error: "explanation_unavailable", detail: result.error }, 502);
  }
  return c.json({ explanation: result.explanation });
});
