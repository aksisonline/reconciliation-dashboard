import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  numeric,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// --- Better Auth managed tables ---
// Schema shape follows Better Auth's Drizzle adapter expectations
// (https://www.better-auth.com/docs/adapters/drizzle). Better Auth's own
// runtime code queries these directly; we don't apply RLS to them.

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  issuer: text("issuer").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- App tables (RLS-protected, all scoped by user_id) ---

export const flagSourceEnum = pgEnum("flag_source", ["orders", "payments"]);
export const flagSeverityEnum = pgEnum("flag_severity", ["info", "warning"]);
export const flagResolutionEnum = pgEnum("flag_resolution", [
  "open",
  "acknowledged",
  "excluded",
]);
export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "matched",
  "discrepancy",
]);
export const discrepancyTypeEnum = pgEnum("discrepancy_type", [
  "MISSING_PAYMENT",
  "MISSING_ORDER",
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "STATUS_MISMATCH",
  "DUPLICATE_PAYMENT",
  "UNRESOLVED_REFUND",
]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull(),
  orderIdNormalized: text("order_id_normalized").notNull(),
  orderDate: timestamp("order_date"),
  customerEmail: text("customer_email"),
  currency: text("currency"),
  grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }),
  discount: numeric("discount", { precision: 12, scale: 2 }),
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }),
  status: text("status"),
  isExcluded: boolean("is_excluded").notNull().default(false),
  rawRow: jsonb("raw_row").notNull(),
  rawRowHash: text("raw_row_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Resolution workflow — layered on top of the deterministic reconciliation result, not a
  // claim that the underlying disagreement stopped existing. See resolution_status below.
  resolutionStatus: text("resolution_status").notNull().default("open"),
  resolutionType: text("resolution_type"),
  resolutionNote: text("resolution_note"),
  resolvedAt: timestamp("resolved_at"),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  transactionRef: text("transaction_ref").notNull(),
  processedAt: timestamp("processed_at"),
  orderReference: text("order_reference").notNull(),
  orderReferenceNormalized: text("order_reference_normalized").notNull(),
  currency: text("currency"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  fee: numeric("fee", { precision: 12, scale: 2 }),
  netSettled: numeric("net_settled", { precision: 12, scale: 2 }),
  type: text("type"),
  status: text("status"),
  isExcluded: boolean("is_excluded").notNull().default(false),
  rawRow: jsonb("raw_row").notNull(),
  rawRowHash: text("raw_row_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolutionStatus: text("resolution_status").notNull().default("open"),
  resolutionType: text("resolution_type"),
  resolutionNote: text("resolution_note"),
  resolvedAt: timestamp("resolved_at"),
});

export const ingestionFlags = pgTable("ingestion_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  source: flagSourceEnum("source").notNull(),
  flagType: text("flag_type").notNull(),
  severity: flagSeverityEnum("severity").notNull().default("info"),
  rowRef: text("row_ref"),
  details: jsonb("details").notNull().default({}),
  resolutionStatus: flagResolutionEnum("resolution_status")
    .notNull()
    .default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reconciliations = pgTable("reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  orderRowId: uuid("order_row_id").references(() => orders.id, {
    onDelete: "cascade",
  }),
  paymentRowId: uuid("payment_row_id").references(() => payments.id, {
    onDelete: "cascade",
  }),
  status: reconciliationStatusEnum("status").notNull(),
  discrepancyType: discrepancyTypeEnum("discrepancy_type"),
  amountAtRisk: numeric("amount_at_risk", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
});

export const discrepancyExplanations = pgTable("discrepancy_explanations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  reconciliationId: uuid("reconciliation_id")
    .notNull()
    .references(() => reconciliations.id, { onDelete: "cascade" }),
  explanationText: text("explanation_text").notNull(),
  structured: jsonb("structured").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const discrepancyChatMessages = pgTable("discrepancy_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  reconciliationId: uuid("reconciliation_id")
    .notNull()
    .references(() => reconciliations.id, { onDelete: "cascade" }),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Portfolio-level "what's going on across all my discrepancies" summary, shown on the
 * dashboard. One row per user — regenerating replaces it rather than accumulating history. */
export const dashboardInsights = pgTable("dashboard_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  structured: jsonb("structured").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** General "ask about your data" chat on the dashboard — not tied to one discrepancy. */
export const dashboardChatMessages = pgTable("dashboard_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
