import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Tx } from "../db/withUserContext";

/** Field names that may be edited, and the original CSV column key each maps to (so an edit
 * updates both the typed DB column and the row's stored rawRow jsonb in lockstep — export then
 * needs no extra overlay logic, it just re-serializes rawRow). */
const EDITABLE_FIELDS = {
  order: { netAmount: "net_amount", currency: "currency", status: "status" },
  payment: { amount: "amount", currency: "currency", status: "status" },
} as const;

export type ResolveTarget = "order" | "payment";

export type ResolveAction =
  | { kind: "edit"; target: ResolveTarget; field: string; value: string }
  | { kind: "exclude"; target: ResolveTarget }
  | { kind: "note"; target: ResolveTarget | "both"; note: string };

export class ResolutionError extends Error {}

/** Applies one of the three resolution primitives (edit / exclude / note) to the order and/or
 * payment row(s) behind a discrepancy. Generic across all 7 discrepancy types instead of one
 * bespoke mutation per type — the frontend's per-type presets just pick which primitive + field
 * to use. Always runs inside the caller's RLS-scoped transaction. */
export async function applyResolution(tx: Tx, userId: string, reconciliationId: string, action: ResolveAction) {
  const [rec] = await tx
    .select()
    .from(schema.reconciliations)
    .where(and(eq(schema.reconciliations.id, reconciliationId), eq(schema.reconciliations.userId, userId)));
  if (!rec) throw new ResolutionError("Discrepancy not found");

  const rowId = (target: ResolveTarget) => (target === "order" ? rec.orderRowId : rec.paymentRowId);

  if (action.kind === "edit") {
    const id = rowId(action.target);
    if (!id) throw new ResolutionError(`No ${action.target} row on this discrepancy`);
    await applyEdit(tx, userId, action.target, id, action.field, action.value);
  } else if (action.kind === "exclude") {
    const id = rowId(action.target);
    if (!id) throw new ResolutionError(`No ${action.target} row on this discrepancy`);
    await applyExclude(tx, userId, action.target, id);
  } else {
    const targets: ResolveTarget[] = action.target === "both" ? ["order", "payment"] : [action.target];
    for (const target of targets) {
      const id = rowId(target);
      if (!id) continue; // e.g. "both" on a MISSING_ORDER discrepancy with no order row — skip silently
      await applyNote(tx, userId, target, id, action.note);
    }
  }

  return getResolvedRow(tx, userId, reconciliationId);
}

async function applyEdit(tx: Tx, userId: string, target: ResolveTarget, rowId: string, field: string, value: string) {
  const allowed = EDITABLE_FIELDS[target] as Record<string, string>;
  const rawKey = allowed[field];
  if (!rawKey) throw new ResolutionError(`"${field}" is not an editable field on a ${target}`);

  const table = target === "order" ? schema.orders : schema.payments;
  const [current] = await tx.select().from(table).where(and(eq(table.id, rowId), eq(table.userId, userId)));
  if (!current) throw new ResolutionError("Row not found");

  const oldValue = (current as Record<string, unknown>)[field];
  const rawRow = { ...(current.rawRow as Record<string, string>), [rawKey]: value };
  const note = `${field} changed from "${oldValue ?? "(empty)"}" to "${value}"`;

  await tx
    .update(table)
    .set({
      [field]: value,
      rawRow,
      resolutionStatus: "resolved",
      resolutionType: "EDIT",
      resolutionNote: note,
      resolvedAt: new Date(),
    } as never)
    .where(and(eq(table.id, rowId), eq(table.userId, userId)));
}

async function applyExclude(tx: Tx, userId: string, target: ResolveTarget, rowId: string) {
  const table = target === "order" ? schema.orders : schema.payments;
  await tx
    .update(table)
    .set({
      isExcluded: true,
      resolutionStatus: "resolved",
      resolutionType: "EXCLUDE",
      resolutionNote: "Excluded from reconciliation",
      resolvedAt: new Date(),
    })
    .where(and(eq(table.id, rowId), eq(table.userId, userId)));
}

async function applyNote(tx: Tx, userId: string, target: ResolveTarget, rowId: string, note: string) {
  if (!note.trim()) throw new ResolutionError("A note is required");
  const table = target === "order" ? schema.orders : schema.payments;
  await tx
    .update(table)
    .set({
      resolutionStatus: "resolved",
      resolutionType: "NOTE",
      resolutionNote: note.trim(),
      resolvedAt: new Date(),
    })
    .where(and(eq(table.id, rowId), eq(table.userId, userId)));
}

/** Clears the resolved workflow marker back to open on both rows behind a discrepancy. Does
 * NOT undo an `edit` action's value change — there's no edit-history table, so a resolved
 * amount/currency/status stays changed even after "undo"; the UI says as much. */
export async function revertResolution(tx: Tx, userId: string, reconciliationId: string) {
  const [rec] = await tx
    .select()
    .from(schema.reconciliations)
    .where(and(eq(schema.reconciliations.id, reconciliationId), eq(schema.reconciliations.userId, userId)));
  if (!rec) throw new ResolutionError("Discrepancy not found");

  const cleared = { resolutionStatus: "open", resolutionType: null, resolutionNote: null, resolvedAt: null };
  if (rec.orderRowId) {
    await tx.update(schema.orders).set(cleared).where(and(eq(schema.orders.id, rec.orderRowId), eq(schema.orders.userId, userId)));
  }
  if (rec.paymentRowId) {
    await tx
      .update(schema.payments)
      .set(cleared)
      .where(and(eq(schema.payments.id, rec.paymentRowId), eq(schema.payments.userId, userId)));
  }

  return getResolvedRow(tx, userId, reconciliationId);
}

async function getResolvedRow(tx: Tx, userId: string, reconciliationId: string) {
  const [row] = await tx
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
    .where(and(eq(schema.reconciliations.id, reconciliationId), eq(schema.reconciliations.userId, userId)));
  return row ?? null;
}
