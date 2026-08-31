import { Hono } from "hono";
import { count, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import * as schema from "../db/schema";

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
