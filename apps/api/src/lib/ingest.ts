import { eq, and } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Tx } from "../db/withUserContext";
import {
  parseCsv,
  parseOrderDate,
  parsePaymentDate,
  parseAmount,
  normalizeKey,
  hashRow,
} from "./csv";

type Flag = {
  source: "orders" | "payments";
  flagType: string;
  severity: "info" | "warning";
  rowRef: string | null;
  details: Record<string, unknown>;
};

const REQUIRED_ORDER_FIELDS = ["order_id", "currency", "net_amount", "status"];
const REQUIRED_PAYMENT_FIELDS = [
  "transaction_ref",
  "order_reference",
  "currency",
  "amount",
  "status",
];

export async function ingestOrders(tx: Tx, userId: string, csvText: string) {
  const rows = parseCsv(csvText);
  const flags: Flag[] = [];
  const seenIds = new Map<string, number>();
  let inserted = 0;

  for (const { index, raw } of rows) {
    const rowRef = `row ${index + 2}`; // +2: 1-based, +1 for header line
    const missing = REQUIRED_ORDER_FIELDS.filter((f) => !raw[f]);
    const netAmount = parseAmount(raw.net_amount);
    const orderDate = parseOrderDate(raw.order_date);

    if (missing.length > 0 || netAmount === null) {
      flags.push({
        source: "orders",
        flagType: "MALFORMED_ROW",
        severity: "warning",
        rowRef,
        details: { missing, raw },
      });
      continue; // excluded by default: never written to the orders table
    }

    const normalized = normalizeKey(raw.order_id);
    if (normalized !== raw.order_id.trim()) {
      flags.push({
        source: "orders",
        flagType: "CASE_MISMATCH_NORMALIZED",
        severity: "info",
        rowRef,
        details: { raw: raw.order_id, normalized },
      });
    }
    if (raw.order_date && !orderDate) {
      flags.push({
        source: "orders",
        flagType: "DATE_FORMAT_NORMALIZED",
        severity: "info",
        rowRef,
        details: { raw: raw.order_date, reason: "unparseable, stored as null" },
      });
    }

    const priorRow = seenIds.get(normalized);
    if (priorRow !== undefined) {
      flags.push({
        source: "orders",
        flagType: "DUPLICATE_KEY",
        severity: "warning",
        rowRef,
        details: { order_id: raw.order_id, firstSeenRow: priorRow },
      });
    } else {
      seenIds.set(normalized, index + 2);
    }

    await tx.insert(schema.orders).values({
      userId,
      orderId: raw.order_id.trim(),
      orderIdNormalized: normalized,
      orderDate,
      customerEmail: raw.customer_email ?? null,
      currency: raw.currency?.trim() ?? null,
      grossAmount: raw.gross_amount ? String(parseAmount(raw.gross_amount)) : null,
      discount: raw.discount ? String(parseAmount(raw.discount)) : null,
      netAmount: String(netAmount),
      status: raw.status?.trim().toLowerCase() ?? null,
      rawRow: raw,
      rawRowHash: await hashRow(raw),
    });
    inserted++;
  }

  await writeFlags(tx, userId, flags);
  return { inserted, flagged: flags.length };
}

export async function ingestPayments(tx: Tx, userId: string, csvText: string) {
  const rows = parseCsv(csvText);
  const flags: Flag[] = [];
  const seenRefs = new Map<string, number>();
  let inserted = 0;

  for (const { index, raw } of rows) {
    const rowRef = `row ${index + 2}`;
    const missing = REQUIRED_PAYMENT_FIELDS.filter((f) => !raw[f]);
    const amount = parseAmount(raw.amount);
    const processedAt = parsePaymentDate(raw.processed_at);

    if (missing.length > 0 || amount === null) {
      flags.push({
        source: "payments",
        flagType: "MALFORMED_ROW",
        severity: "warning",
        rowRef,
        details: { missing, raw },
      });
      continue;
    }

    const normalizedRef = normalizeKey(raw.order_reference);
    if (normalizedRef !== raw.order_reference.trim()) {
      flags.push({
        source: "payments",
        flagType: "CASE_MISMATCH_NORMALIZED",
        severity: "info",
        rowRef,
        details: { raw: raw.order_reference, normalized: normalizedRef },
      });
    }
    if (raw.processed_at && !processedAt) {
      flags.push({
        source: "payments",
        flagType: "DATE_FORMAT_NORMALIZED",
        severity: "info",
        rowRef,
        details: { raw: raw.processed_at, reason: "unparseable, stored as null" },
      });
    }

    const priorRow = seenRefs.get(raw.transaction_ref.trim());
    if (priorRow !== undefined) {
      flags.push({
        source: "payments",
        flagType: "DUPLICATE_KEY",
        severity: "warning",
        rowRef,
        details: { transaction_ref: raw.transaction_ref, firstSeenRow: priorRow },
      });
    } else {
      seenRefs.set(raw.transaction_ref.trim(), index + 2);
    }

    await tx.insert(schema.payments).values({
      userId,
      transactionRef: raw.transaction_ref.trim(),
      processedAt,
      orderReference: raw.order_reference.trim(),
      orderReferenceNormalized: normalizedRef,
      currency: raw.currency?.trim() ?? null,
      amount: String(amount),
      fee: raw.fee ? String(parseAmount(raw.fee)) : null,
      netSettled: raw.net_settled ? String(parseAmount(raw.net_settled)) : null,
      type: raw.type?.trim().toLowerCase() ?? null,
      status: raw.status?.trim().toLowerCase() ?? null,
      rawRow: raw,
      rawRowHash: await hashRow(raw),
    });
    inserted++;
  }

  await writeFlags(tx, userId, flags);
  return { inserted, flagged: flags.length };
}

/** Cross-file structural checks, run after both files are loaded. */
export async function runStructuralChecks(tx: Tx, userId: string) {
  const orderRows = await tx
    .select({ id: schema.orders.id, key: schema.orders.orderIdNormalized })
    .from(schema.orders)
    .where(and(eq(schema.orders.userId, userId), eq(schema.orders.isExcluded, false)));

  const paymentRows = await tx
    .select({
      id: schema.payments.id,
      key: schema.payments.orderReferenceNormalized,
    })
    .from(schema.payments)
    .where(and(eq(schema.payments.userId, userId), eq(schema.payments.isExcluded, false)));

  const orderKeys = new Set(orderRows.map((o) => o.key));
  const paymentCountByKey = new Map<string, number>();
  for (const p of paymentRows) {
    paymentCountByKey.set(p.key, (paymentCountByKey.get(p.key) ?? 0) + 1);
  }

  const flags: Flag[] = [];

  for (const key of orderKeys) {
    if (!paymentCountByKey.has(key)) {
      flags.push({
        source: "orders",
        flagType: "ORPHAN_ORDER",
        severity: "warning",
        rowRef: key,
        details: { order_id: key },
      });
    }
  }

  for (const [key, count] of paymentCountByKey) {
    if (!orderKeys.has(key)) {
      flags.push({
        source: "payments",
        flagType: "ORPHAN_PAYMENT",
        severity: "warning",
        rowRef: key,
        details: { order_reference: key },
      });
    } else if (count > 1) {
      flags.push({
        source: "payments",
        flagType: "MULTIPLE_PAYMENTS_FOR_ORDER",
        severity: "info",
        rowRef: key,
        details: { order_reference: key, count },
      });
    }
  }

  await writeFlags(tx, userId, flags);
  return flags.length;
}

async function writeFlags(tx: Tx, userId: string, flags: Flag[]) {
  if (flags.length === 0) return;
  await tx.insert(schema.ingestionFlags).values(
    flags.map((f) => ({
      userId,
      source: f.source,
      flagType: f.flagType,
      severity: f.severity,
      rowRef: f.rowRef,
      details: f.details,
    })),
  );
}
