import { Hono } from "hono";
import { count, eq, max } from "drizzle-orm";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import * as schema from "../db/schema";

export const dataRoutes = new Hono<AppEnv>();

dataRoutes.get("/status", async (c) => {
  const userId = c.get("userId");

  const status = await withUserContext(userId, async (tx) => {
    const [orderStats] = await tx
      .select({ count: count(), lastUpload: max(schema.orders.createdAt) })
      .from(schema.orders)
      .where(eq(schema.orders.userId, userId));

    const [paymentStats] = await tx
      .select({ count: count(), lastUpload: max(schema.payments.createdAt) })
      .from(schema.payments)
      .where(eq(schema.payments.userId, userId));

    const [reconcileStats] = await tx
      .select({ count: count(), lastRun: max(schema.reconciliations.computedAt) })
      .from(schema.reconciliations)
      .where(eq(schema.reconciliations.userId, userId));

    return {
      orders: orderStats,
      payments: paymentStats,
      reconciliations: reconcileStats,
    };
  });

  return c.json(status);
});

dataRoutes.delete("/", async (c) => {
  const userId = c.get("userId");
  await withUserContext(userId, async (tx) => {
    await tx.delete(schema.discrepancyExplanations).where(eq(schema.discrepancyExplanations.userId, userId));
    await tx.delete(schema.reconciliations).where(eq(schema.reconciliations.userId, userId));
    await tx.delete(schema.ingestionFlags).where(eq(schema.ingestionFlags.userId, userId));
    await tx.delete(schema.orders).where(eq(schema.orders.userId, userId));
    await tx.delete(schema.payments).where(eq(schema.payments.userId, userId));
  });
  return c.json({ ok: true });
});
