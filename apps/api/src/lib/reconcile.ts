import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Tx } from "../db/withUserContext";

const AMOUNT_TOLERANCE = 0.01;

type OrderRow = typeof schema.orders.$inferSelect;
type PaymentRow = typeof schema.payments.$inferSelect;

type ReconciliationInsert = typeof schema.reconciliations.$inferInsert;

export async function runReconciliation(tx: Tx, userId: string) {
  const orders = await tx
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.userId, userId), eq(schema.orders.isExcluded, false)));

  const payments = await tx
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.userId, userId), eq(schema.payments.isExcluded, false)));

  const paymentsByKey = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    const list = paymentsByKey.get(p.orderReferenceNormalized) ?? [];
    list.push(p);
    paymentsByKey.set(p.orderReferenceNormalized, list);
  }

  const matchedOrderKeys = new Set<string>();
  const results: ReconciliationInsert[] = [];

  for (const order of orders) {
    matchedOrderKeys.add(order.orderIdNormalized);
    const linked = paymentsByKey.get(order.orderIdNormalized) ?? [];
    results.push(classifyOrder(userId, order, linked));
  }

  // Payments whose order_reference doesn't correspond to any order row at all.
  for (const [key, list] of paymentsByKey) {
    if (matchedOrderKeys.has(key)) continue;
    for (const payment of list) {
      results.push({
        userId,
        orderRowId: null,
        paymentRowId: payment.id,
        status: "discrepancy",
        discrepancyType: "MISSING_ORDER",
        amountAtRisk: payment.amount ?? "0",
      });
    }
  }

  await tx.delete(schema.reconciliations).where(eq(schema.reconciliations.userId, userId));
  if (results.length > 0) {
    await tx.insert(schema.reconciliations).values(results);
  }

  return {
    total: results.length,
    matched: results.filter((r) => r.status === "matched").length,
    discrepancies: results.filter((r) => r.status === "discrepancy").length,
  };
}

export function classifyOrder(
  userId: string,
  order: OrderRow,
  linked: PaymentRow[],
): ReconciliationInsert {
  const netAmount = Number(order.netAmount ?? 0);
  const base = { userId, orderRowId: order.id };

  if (linked.length === 0) {
    if (order.status === "completed") {
      return discrepancy(base, null, "MISSING_PAYMENT", netAmount);
    }
    if (order.status === "refunded") {
      return discrepancy(base, null, "UNRESOLVED_REFUND", netAmount);
    }
    // cancelled with nothing charged: consistent, nothing at risk
    return matched(base, null);
  }

  const settledCharges = linked.filter((p) => p.type === "charge" && p.status === "settled");
  const refunds = linked.filter((p) => p.type === "refund");
  const failedOrPending = linked.filter((p) => p.status === "failed" || p.status === "pending");
  const primary = settledCharges[0] ?? linked[0];

  const currencyMismatch = linked.some((p) => p.currency && order.currency && p.currency !== order.currency);
  if (currencyMismatch) {
    return discrepancy(base, primary.id, "CURRENCY_MISMATCH", netAmount);
  }

  if (settledCharges.length > 1 && refunds.length === 0) {
    const total = settledCharges.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    return discrepancy(base, primary.id, "DUPLICATE_PAYMENT", total - netAmount);
  }

  if (order.status === "refunded" && refunds.length === 0) {
    return discrepancy(base, primary.id, "UNRESOLVED_REFUND", netAmount);
  }

  if ((order.status === "cancelled" || order.status === "refunded") &&
    settledCharges.length > 0 && refunds.length === 0) {
    return discrepancy(base, primary.id, "STATUS_MISMATCH", netAmount);
  }

  if (order.status === "completed" && settledCharges.length === 0) {
    if (failedOrPending.length > 0) {
      return discrepancy(base, primary.id, "STATUS_MISMATCH", netAmount);
    }
    return discrepancy(base, null, "MISSING_PAYMENT", netAmount);
  }

  const diff = Math.abs(netAmount - Number(primary.amount ?? 0));
  if (diff > AMOUNT_TOLERANCE) {
    return discrepancy(base, primary.id, "AMOUNT_MISMATCH", diff);
  }

  return matched(base, primary.id);
}

function discrepancy(
  base: { userId: string; orderRowId: string },
  paymentRowId: string | null,
  type: NonNullable<ReconciliationInsert["discrepancyType"]>,
  amountAtRisk: number,
): ReconciliationInsert {
  return {
    ...base,
    paymentRowId,
    status: "discrepancy",
    discrepancyType: type,
    amountAtRisk: amountAtRisk.toFixed(2),
  };
}

function matched(
  base: { userId: string; orderRowId: string },
  paymentRowId: string | null,
): ReconciliationInsert {
  return {
    ...base,
    paymentRowId,
    status: "matched",
    discrepancyType: null,
    amountAtRisk: "0",
  };
}
