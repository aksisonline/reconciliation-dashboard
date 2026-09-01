import type { Discrepancy, DiscrepancyType, ResolveAction } from "./types";

export const FLAG_COPY: Record<string, { label: string; description: string; tone: "info" | "warning" }> = {
  MALFORMED_ROW: {
    label: "Couldn't read this row",
    description: "A required field was missing or unreadable, so this row was left out of matching entirely.",
    tone: "warning",
  },
  DUPLICATE_KEY: {
    label: "Duplicate ID",
    description: "The same id appears more than once in the file. Only the first occurrence is used for matching.",
    tone: "warning",
  },
  CASE_MISMATCH_NORMALIZED: {
    label: "Inconsistent capitalization",
    description: "The id was typed in a different case than usual (e.g. lowercase). It was normalized automatically so matching still works.",
    tone: "info",
  },
  DATE_FORMAT_NORMALIZED: {
    label: "Unrecognized date",
    description: "The date couldn't be parsed in either expected format, so it was stored as empty rather than guessed.",
    tone: "info",
  },
  ORPHAN_ORDER: {
    label: "Order with no payment",
    description: "This order has no matching payment record at all — nothing was ever charged for it, or the payment export is missing it.",
    tone: "warning",
  },
  ORPHAN_PAYMENT: {
    label: "Payment with no order",
    description: "This payment references an order id that doesn't exist in the orders file.",
    tone: "warning",
  },
  MULTIPLE_PAYMENTS_FOR_ORDER: {
    label: "Multiple payments, one order",
    description: "More than one payment references this order. Could be a legitimate charge + refund pair, or a duplicate charge — reconciliation decides which.",
    tone: "info",
  },
};

export const DISCREPANCY_COPY: Record<DiscrepancyType, { label: string; description: string }> = {
  MISSING_PAYMENT: {
    label: "Missing payment",
    description: "This order is marked completed, but no payment was ever recorded for it.",
  },
  MISSING_ORDER: {
    label: "Missing order",
    description: "This payment doesn't correspond to any known order.",
  },
  AMOUNT_MISMATCH: {
    label: "Amount mismatch",
    description: "The order total and the amount actually charged don't agree, beyond rounding.",
  },
  CURRENCY_MISMATCH: {
    label: "Currency mismatch",
    description: "The order and its payment were recorded in different currencies.",
  },
  STATUS_MISMATCH: {
    label: "Status mismatch",
    description: "The order's status and the payment's outcome don't line up (e.g. charged but order says cancelled).",
  },
  DUPLICATE_PAYMENT: {
    label: "Duplicate payment",
    description: "This order was charged more than once with no refund to explain the second charge.",
  },
  UNRESOLVED_REFUND: {
    label: "Unresolved refund",
    description: "The order is marked refunded, but no refund payment was found.",
  },
};

/** A resolution preset is either applied immediately (edit/exclude — the value is deterministic
 * from the discrepancy's own data) or opens a note prompt first (note — needs user text). Curated
 * per discrepancy type instead of one bespoke action type per case; see resolve-discrepancy.tsx. */
export type ResolutionPreset = { id: string; label: string } & (
  | { primitive: "edit"; target: "order" | "payment"; field: string; getValue: (d: Discrepancy) => string | null }
  | { primitive: "exclude"; target: "order" | "payment" }
  | { primitive: "note"; target: "order" | "payment" | "both"; defaultNote: string }
);

export function presetAction(preset: ResolutionPreset, d: Discrepancy, note?: string): ResolveAction | null {
  if (preset.primitive === "edit") {
    const value = preset.getValue(d);
    return value === null ? null : { kind: "edit", target: preset.target, field: preset.field, value };
  }
  if (preset.primitive === "exclude") {
    return { kind: "exclude", target: preset.target };
  }
  return { kind: "note", target: preset.target, note: note ?? preset.defaultNote };
}

export const RESOLUTION_PRESETS: Record<DiscrepancyType, ResolutionPreset[]> = {
  MISSING_PAYMENT: [
    { id: "write-off", label: "Write off", primitive: "note", target: "order", defaultNote: "Written off — payment not recoverable." },
    {
      id: "paid-externally",
      label: "Mark paid outside the system",
      primitive: "note",
      target: "order",
      defaultNote: "Payment received through another channel; reconciled manually.",
    },
  ],
  MISSING_ORDER: [
    { id: "exclude-payment", label: "Exclude this payment", primitive: "exclude", target: "payment" },
    {
      id: "reviewed",
      label: "Mark reviewed",
      primitive: "note",
      target: "payment",
      defaultNote: "Reviewed — no matching order, accepted as-is.",
    },
  ],
  AMOUNT_MISMATCH: [
    {
      id: "match-order-to-payment",
      label: "Match order to payment amount",
      primitive: "edit",
      target: "order",
      field: "netAmount",
      getValue: (d) => (d.payment?.amount != null ? String(d.payment.amount) : null),
    },
    {
      id: "match-payment-to-order",
      label: "Match payment to order amount",
      primitive: "edit",
      target: "payment",
      field: "amount",
      getValue: (d) => (d.order?.netAmount != null ? String(d.order.netAmount) : null),
    },
    { id: "accept-variance", label: "Accept the variance", primitive: "note", target: "both", defaultNote: "Amount variance reviewed and accepted." },
  ],
  CURRENCY_MISMATCH: [
    {
      id: "use-payment-currency",
      label: "Use the payment's currency",
      primitive: "edit",
      target: "order",
      field: "currency",
      getValue: (d) => (typeof d.payment?.currency === "string" ? d.payment.currency : null),
    },
    {
      id: "use-order-currency",
      label: "Use the order's currency",
      primitive: "edit",
      target: "payment",
      field: "currency",
      getValue: (d) => (typeof d.order?.currency === "string" ? d.order.currency : null),
    },
    { id: "accept-variance", label: "Accept the variance", primitive: "note", target: "both", defaultNote: "Currency variance reviewed and accepted." },
  ],
  STATUS_MISMATCH: [
    { id: "reviewed", label: "Mark reviewed", primitive: "note", target: "both", defaultNote: "Status mismatch reviewed and accepted." },
  ],
  DUPLICATE_PAYMENT: [
    { id: "exclude-duplicate", label: "Exclude this duplicate payment", primitive: "exclude", target: "payment" },
    {
      id: "refund-pending",
      label: "Refund pending",
      primitive: "note",
      target: "order",
      defaultNote: "Duplicate charge — refund to be issued outside the system.",
    },
  ],
  UNRESOLVED_REFUND: [
    { id: "refund-pending", label: "Refund pending", primitive: "note", target: "order", defaultNote: "Refund tracked outside the system." },
    {
      id: "not-actually-refunded",
      label: "Order wasn't actually refunded",
      primitive: "edit",
      target: "order",
      field: "status",
      getValue: () => "completed",
    },
  ],
};
