import { describe, expect, test } from "bun:test";
import { classifyOrder } from "../reconcile";
import type { orders, payments } from "../../db/schema";

type OrderRow = typeof orders.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

function order(overrides: Partial<OrderRow>): OrderRow {
  return {
    id: "order-1",
    userId: "user-1",
    orderId: "ORD-1",
    orderIdNormalized: "ORD-1",
    orderDate: null,
    customerEmail: null,
    currency: "USD",
    grossAmount: null,
    discount: null,
    netAmount: "100.00",
    status: "completed",
    isExcluded: false,
    rawRow: {},
    rawRowHash: "x",
    createdAt: new Date(),
    resolutionStatus: "open",
    resolutionType: null,
    resolutionNote: null,
    resolvedAt: null,
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentRow>): PaymentRow {
  return {
    id: "payment-1",
    userId: "user-1",
    transactionRef: "TXN-1",
    processedAt: null,
    orderReference: "ORD-1",
    orderReferenceNormalized: "ORD-1",
    currency: "USD",
    amount: "100.00",
    fee: null,
    netSettled: null,
    type: "charge",
    status: "settled",
    isExcluded: false,
    rawRow: {},
    rawRowHash: "x",
    createdAt: new Date(),
    resolutionStatus: "open",
    resolutionType: null,
    resolutionNote: null,
    resolvedAt: null,
    ...overrides,
  };
}

describe("classifyOrder", () => {
  test("matches a clean completed order with a settled charge for the same amount", () => {
    const result = classifyOrder("user-1", order({}), [payment({})]);
    expect(result.status).toBe("matched");
    expect(result.discrepancyType).toBeNull();
  });

  test("flags a completed order with no payment as MISSING_PAYMENT", () => {
    const result = classifyOrder("user-1", order({}), []);
    expect(result.status).toBe("discrepancy");
    expect(result.discrepancyType).toBe("MISSING_PAYMENT");
    expect(result.amountAtRisk).toBe("100.00");
  });

  test("flags an amount mismatch beyond the $0.01 tolerance", () => {
    const result = classifyOrder("user-1", order({ netAmount: "100.00" }), [
      payment({ amount: "95.00" }),
    ]);
    expect(result.discrepancyType).toBe("AMOUNT_MISMATCH");
    expect(result.amountAtRisk).toBe("5.00");
  });

  test("does not flag a sub-cent rounding difference", () => {
    const result = classifyOrder("user-1", order({ netAmount: "100.00" }), [
      payment({ amount: "100.005" }),
    ]);
    expect(result.status).toBe("matched");
  });

  test("flags a currency mismatch even when the amount matches", () => {
    const result = classifyOrder("user-1", order({ currency: "USD" }), [
      payment({ currency: "EUR" }),
    ]);
    expect(result.discrepancyType).toBe("CURRENCY_MISMATCH");
  });

  test("flags a duplicate settled charge with no offsetting refund", () => {
    const result = classifyOrder("user-1", order({}), [
      payment({ id: "p1", amount: "100.00" }),
      payment({ id: "p2", amount: "100.00" }),
    ]);
    expect(result.discrepancyType).toBe("DUPLICATE_PAYMENT");
  });

  test("does not flag duplicate when a refund offsets the second charge", () => {
    const result = classifyOrder("user-1", order({}), [
      payment({ id: "p1", type: "charge", status: "settled", amount: "100.00" }),
      payment({ id: "p2", type: "refund", status: "settled", amount: "100.00" }),
    ]);
    expect(result.discrepancyType).not.toBe("DUPLICATE_PAYMENT");
  });

  test("flags a refunded order with no refund payment as UNRESOLVED_REFUND", () => {
    const result = classifyOrder("user-1", order({ status: "refunded" }), []);
    expect(result.discrepancyType).toBe("UNRESOLVED_REFUND");
  });

  test("flags a cancelled order that was still charged as STATUS_MISMATCH", () => {
    const result = classifyOrder("user-1", order({ status: "cancelled" }), [payment({})]);
    expect(result.discrepancyType).toBe("STATUS_MISMATCH");
  });

  test("matches a cancelled order with nothing charged", () => {
    const result = classifyOrder("user-1", order({ status: "cancelled" }), []);
    expect(result.status).toBe("matched");
  });

  test("flags a completed order whose only payment failed", () => {
    const result = classifyOrder("user-1", order({}), [payment({ status: "failed" })]);
    expect(result.discrepancyType).toBe("STATUS_MISMATCH");
  });
});
