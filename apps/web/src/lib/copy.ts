import type { DiscrepancyType } from "./types";

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
