import { Hono, type Context } from "hono";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import * as schema from "../db/schema";

export const exportRoutes = new Hono<AppEnv>();

function csvResponse(c: Context<AppEnv>, csv: string, filename: string) {
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
}

/** Regenerates a final orders.csv or payments.csv straight from each row's stored raw CSV data
 * — an `edit` resolution already overlays the new value into rawRow when it's applied (see
 * resolution.ts), so this needs no extra logic beyond dropping excluded rows. */
async function exportRawRows(c: Context<AppEnv>, table: typeof schema.orders | typeof schema.payments, filename: string) {
  const userId = c.get("userId");
  const rows = await withUserContext(userId, (tx) =>
    tx
      .select({ rawRow: table.rawRow, isExcluded: table.isExcluded })
      .from(table)
      .where(eq(table.userId, userId)),
  );
  const data = rows.filter((r) => !r.isExcluded).map((r) => r.rawRow as Record<string, string>);
  return csvResponse(c, Papa.unparse(data), filename);
}

exportRoutes.get("/orders.csv", (c) => exportRawRows(c, schema.orders, "orders.csv"));
exportRoutes.get("/payments.csv", (c) => exportRawRows(c, schema.payments, "payments.csv"));

exportRoutes.get("/report.csv", async (c) => {
  const userId = c.get("userId");

  const rows = await withUserContext(userId, (tx) =>
    tx
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
      .where(eq(schema.reconciliations.userId, userId)),
  );

  const fields = [
    "reconciliation_id",
    "status",
    "discrepancy_type",
    "amount_at_risk",
    "order_id",
    "order_currency",
    "order_net_amount",
    "order_status",
    "payment_transaction_ref",
    "payment_currency",
    "payment_amount",
    "payment_status",
    "resolution_status",
    "resolution_type",
    "resolution_note",
    "resolved_at",
  ];

  const data = rows.map((r) => [
    r.id,
    r.status,
    r.discrepancyType ?? "",
    r.amountAtRisk,
    r.order?.orderId ?? "",
    r.order?.currency ?? "",
    r.order?.netAmount ?? "",
    r.order?.status ?? "",
    r.payment?.transactionRef ?? "",
    r.payment?.currency ?? "",
    r.payment?.amount ?? "",
    r.payment?.status ?? "",
    // Resolution lives on whichever row the discrepancy centers on — prefer the order's, fall
    // back to the payment's (the MISSING_ORDER case, where there's no order row at all).
    r.order?.resolutionStatus ?? r.payment?.resolutionStatus ?? "open",
    r.order?.resolutionType ?? r.payment?.resolutionType ?? "",
    r.order?.resolutionNote ?? r.payment?.resolutionNote ?? "",
    r.order?.resolvedAt ?? r.payment?.resolvedAt ?? "",
  ]);

  return csvResponse(c, Papa.unparse({ fields, data }), "reconciliation-report.csv");
});
