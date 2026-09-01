export type IngestionFlag = {
  id: string;
  source: "orders" | "payments";
  flagType: string;
  severity: "info" | "warning";
  rowRef: string | null;
  details: Record<string, unknown>;
  resolutionStatus: "open" | "acknowledged" | "excluded";
  createdAt: string;
};

export type DataStatus = {
  orders: { count: number; lastUpload: string | null };
  payments: { count: number; lastUpload: string | null };
  reconciliations: { count: number; lastRun: string | null };
};

export type DiscrepancyType =
  | "MISSING_PAYMENT"
  | "MISSING_ORDER"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "STATUS_MISMATCH"
  | "DUPLICATE_PAYMENT"
  | "UNRESOLVED_REFUND";

export type DashboardSummary = {
  totalOrders: number;
  totalPayments: number;
  totalReconciliations: number;
  valueReconciled: number;
  valueInDispute: number;
  moneyAtRisk: number;
  byType: Record<string, { count: number; amountAtRisk: number }>;
};

export type ResolutionType = "EDIT" | "EXCLUDE" | "NOTE";

type ResolutionFields = {
  resolutionStatus: "open" | "resolved";
  resolutionType: ResolutionType | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
};

export type OrderRecord = Record<string, unknown> &
  ResolutionFields & { id: string; orderId: string; isExcluded: boolean };
export type PaymentRecord = Record<string, unknown> &
  ResolutionFields & { id: string; transactionRef: string; isExcluded: boolean };

export type ResolveAction =
  | { kind: "edit"; target: "order" | "payment"; field: string; value: string }
  | { kind: "exclude"; target: "order" | "payment" }
  | { kind: "note"; target: "order" | "payment" | "both"; note: string };

export type Discrepancy = {
  id: string;
  status: "matched" | "discrepancy";
  discrepancyType: DiscrepancyType | null;
  amountAtRisk: string;
  computedAt: string;
  order: OrderRecord | null;
  payment: PaymentRecord | null;
};

export type Explanation = {
  likely_cause: string;
  recommended_action: string;
  suggested_actions?: string[];
  confidence: "low" | "medium" | "high";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contentHtml?: string;
  createdAt: string;
};
