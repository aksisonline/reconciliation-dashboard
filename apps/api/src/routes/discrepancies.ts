import { Hono } from "hono";
import { and, eq, ilike, or, desc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import * as schema from "../db/schema";

export const discrepancyRoutes = new Hono<AppEnv>();

discrepancyRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type");
  const search = c.req.query("search");

  const rows = await withUserContext(userId, async (tx) => {
    const conditions = [eq(schema.reconciliations.userId, userId), eq(schema.reconciliations.status, "discrepancy")];
    if (type) conditions.push(eq(schema.reconciliations.discrepancyType, type as never));

    const searchCondition = search
      ? or(
          ilike(schema.orders.orderId, `%${search}%`),
          ilike(schema.payments.transactionRef, `%${search}%`),
          ilike(schema.orders.customerEmail, `%${search}%`),
        )
      : undefined;

    return tx
      .select({
        id: schema.reconciliations.id,
        status: schema.reconciliations.status,
        discrepancyType: schema.reconciliations.discrepancyType,
        amountAtRisk: schema.reconciliations.amountAtRisk,
        computedAt: schema.reconciliations.computedAt,
        order: schema.orders,
        payment: schema.payments,
      })
      .from(schema.reconciliations)
      .leftJoin(schema.orders, eq(schema.reconciliations.orderRowId, schema.orders.id))
      .leftJoin(schema.payments, eq(schema.reconciliations.paymentRowId, schema.payments.id))
      .where(searchCondition ? and(...conditions, searchCondition) : and(...conditions))
      .orderBy(desc(schema.reconciliations.computedAt));
  });

  return c.json({ discrepancies: rows });
});

discrepancyRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const row = await withUserContext(userId, async (tx) => {
    const [r] = await tx
      .select({
        id: schema.reconciliations.id,
        status: schema.reconciliations.status,
        discrepancyType: schema.reconciliations.discrepancyType,
        amountAtRisk: schema.reconciliations.amountAtRisk,
        computedAt: schema.reconciliations.computedAt,
        order: schema.orders,
        payment: schema.payments,
      })
      .from(schema.reconciliations)
      .leftJoin(schema.orders, eq(schema.reconciliations.orderRowId, schema.orders.id))
      .leftJoin(schema.payments, eq(schema.reconciliations.paymentRowId, schema.payments.id))
      .where(and(eq(schema.reconciliations.id, id), eq(schema.reconciliations.userId, userId)));
    return r ?? null;
  });

  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});
