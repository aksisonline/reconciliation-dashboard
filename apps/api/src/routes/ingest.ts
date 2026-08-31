import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import * as schema from "../db/schema";
import { ingestOrders, ingestPayments, runStructuralChecks } from "../lib/ingest";

export const ingestRoutes = new Hono<AppEnv>();

ingestRoutes.post("/orders", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.text();
  if (!body.trim()) return c.json({ error: "Empty file" }, 400);

  const result = await withUserContext(userId, (tx) => ingestOrders(tx, userId, body));
  return c.json(result);
});

ingestRoutes.post("/payments", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.text();
  if (!body.trim()) return c.json({ error: "Empty file" }, 400);

  const result = await withUserContext(userId, (tx) => ingestPayments(tx, userId, body));
  return c.json(result);
});

ingestRoutes.post("/check", async (c) => {
  const userId = c.get("userId");
  const flagged = await withUserContext(userId, (tx) => runStructuralChecks(tx, userId));
  return c.json({ flagged });
});

ingestRoutes.get("/flags", async (c) => {
  const userId = c.get("userId");
  const rows = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(schema.ingestionFlags)
      .where(eq(schema.ingestionFlags.userId, userId))
      .orderBy(desc(schema.ingestionFlags.createdAt)),
  );
  return c.json({ flags: rows });
});

ingestRoutes.post("/flags/:id/acknowledge", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  await withUserContext(userId, (tx) =>
    tx
      .update(schema.ingestionFlags)
      .set({ resolutionStatus: "acknowledged" })
      .where(eq(schema.ingestionFlags.id, id)),
  );
  return c.json({ ok: true });
});

ingestRoutes.post("/flags/:id/exclude", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  await withUserContext(userId, async (tx) => {
    const [flag] = await tx
      .select()
      .from(schema.ingestionFlags)
      .where(eq(schema.ingestionFlags.id, id));
    if (!flag) return;

    await tx
      .update(schema.ingestionFlags)
      .set({ resolutionStatus: "excluded" })
      .where(eq(schema.ingestionFlags.id, id));

    // rowRef holds the normalized key for structural flags, or "row N" for
    // per-row parse flags recorded before insertion (nothing to exclude there).
    if (flag.source === "orders") {
      await tx
        .update(schema.orders)
        .set({ isExcluded: true })
        .where(eq(schema.orders.orderIdNormalized, flag.rowRef ?? ""));
    } else {
      await tx
        .update(schema.payments)
        .set({ isExcluded: true })
        .where(eq(schema.payments.orderReferenceNormalized, flag.rowRef ?? ""));
    }
  });

  return c.json({ ok: true });
});
