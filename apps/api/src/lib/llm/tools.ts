import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { Tx } from "../../db/withUserContext";

/**
 * Read-only tools the explanation agent can call. Every tool is scoped to
 * the calling user's own transaction (RLS-enforced) and either fetches
 * already-computed reconciliation data or does a deterministic calculation —
 * the agent is never handed raw numbers to reason about on its own, and it
 * has no write access, so it cannot influence matching decisions.
 */
export function buildTools(tx: Tx, userId: string) {
  const getDiscrepancy = tool(
    async ({ id }: { id: string }) => {
      const [row] = await tx
        .select()
        .from(schema.reconciliations)
        .where(and(eq(schema.reconciliations.id, id), eq(schema.reconciliations.userId, userId)));
      if (!row) return JSON.stringify({ error: "not found" });

      const order = row.orderRowId
        ? (await tx.select().from(schema.orders).where(eq(schema.orders.id, row.orderRowId)))[0]
        : null;
      const payment = row.paymentRowId
        ? (await tx.select().from(schema.payments).where(eq(schema.payments.id, row.paymentRowId)))[0]
        : null;

      return JSON.stringify({ reconciliation: row, order, payment });
    },
    {
      name: "getDiscrepancy",
      description:
        "Fetch one discrepancy by its reconciliation id, including the linked raw order and payment records.",
      schema: z.object({ id: z.string().describe("reconciliation row id") }),
    },
  );

  const getDiscrepanciesByType = tool(
    async ({ type }: { type: string }) => {
      const rows = await tx
        .select()
        .from(schema.reconciliations)
        .where(
          and(
            eq(schema.reconciliations.userId, userId),
            eq(schema.reconciliations.discrepancyType, type as never),
          ),
        );
      return JSON.stringify(rows);
    },
    {
      name: "getDiscrepanciesByType",
      description:
        "List all discrepancies of one type (e.g. MISSING_PAYMENT, AMOUNT_MISMATCH, CURRENCY_MISMATCH, STATUS_MISMATCH, DUPLICATE_PAYMENT, UNRESOLVED_REFUND, MISSING_ORDER).",
      schema: z.object({ type: z.string() }),
    },
  );

  const getSummaryTotals = tool(
    async () => {
      const rows = await tx
        .select()
        .from(schema.reconciliations)
        .where(eq(schema.reconciliations.userId, userId));

      const totalDiscrepancies = rows.filter((r) => r.status === "discrepancy").length;
      const totalMatched = rows.filter((r) => r.status === "matched").length;
      const amountAtRisk = rows.reduce((sum, r) => sum + Number(r.amountAtRisk ?? 0), 0);
      const byType: Record<string, number> = {};
      for (const r of rows) {
        if (r.discrepancyType) byType[r.discrepancyType] = (byType[r.discrepancyType] ?? 0) + 1;
      }

      return JSON.stringify({ totalDiscrepancies, totalMatched, amountAtRisk, byType });
    },
    {
      name: "getSummaryTotals",
      description: "Get headline reconciliation totals: counts of matched vs discrepant, total amount at risk, breakdown by discrepancy type.",
      schema: z.object({}),
    },
  );

  const compareAmounts = tool(
    async ({ a, b }: { a: number; b: number }) => {
      const diff = a - b;
      const pct = b !== 0 ? (diff / b) * 100 : null;
      return JSON.stringify({ difference: Number(diff.toFixed(2)), percentDifference: pct !== null ? Number(pct.toFixed(2)) : null });
    },
    {
      name: "compareAmounts",
      description:
        "Deterministically compute the difference and percent difference between two amounts. Use this instead of doing the arithmetic yourself.",
      schema: z.object({ a: z.number(), b: z.number() }),
    },
  );

  return [getDiscrepancy, getDiscrepanciesByType, getSummaryTotals, compareAmounts];
}
