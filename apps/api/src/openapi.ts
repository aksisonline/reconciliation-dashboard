/** Hand-authored OpenAPI 3.1 document for the API — served at /openapi.json and rendered
 * with Scalar at /docs (see index.ts). Not generated from the Zod schemas/route handlers, so
 * it can drift; kept intentionally lightweight (a take-home extra, not a contract other
 * services depend on). Every /api/* route besides /api/auth/* requires the Better Auth
 * session cookie — expressed once via the `cookieAuth` security scheme below rather than
 * repeated on every operation. */
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Reconciliation Dashboard API",
    version: "1.0.0",
    description:
      "Ingests orders.csv / payments.csv, deterministically reconciles them, and exposes an LLM " +
      "explanation layer over the result. All endpoints below /api (other than /api/auth/*) require " +
      "a Better Auth session cookie and are scoped to the calling user via Postgres row-level security.",
  },
  servers: [{ url: "/", description: "Same origin as this docs page" }],
  tags: [
    { name: "Auth", description: "Better Auth — email/password signup, login, logout, session" },
    { name: "Ingestion", description: "CSV upload, screening flags, row-level exclude/acknowledge" },
    { name: "Data", description: "Current dataset status; wipe and start over" },
    { name: "Reconciliation", description: "Deterministic order↔payment matching — no LLM involved" },
    { name: "Dashboard", description: "Headline figures, AI insight, whole-reconciliation chat" },
    { name: "Discrepancies", description: "Drill-down list/detail, Explain, per-discrepancy chat" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "Set by /api/auth/sign-in/email or /api/auth/sign-up/email.",
      },
    },
    schemas: {
      Explanation: {
        type: "object",
        properties: {
          likely_cause: { type: "string" },
          recommended_action: { type: "string" },
          suggested_actions: { type: "array", items: { type: "string" }, maxItems: 4 },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
      DiscrepancyType: {
        type: "string",
        enum: [
          "MISSING_PAYMENT",
          "MISSING_ORDER",
          "AMOUNT_MISMATCH",
          "CURRENCY_MISMATCH",
          "STATUS_MISMATCH",
          "DUPLICATE_PAYMENT",
          "UNRESOLVED_REFUND",
        ],
      },
      FlagType: {
        type: "string",
        enum: [
          "MALFORMED_ROW",
          "DUPLICATE_KEY",
          "ORPHAN_ORDER",
          "ORPHAN_PAYMENT",
          "MULTIPLE_PAYMENTS_FOR_ORDER",
          "CASE_MISMATCH_NORMALIZED",
        ],
      },
      ChatMessage: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          role: { type: "string", enum: ["user", "assistant"] },
          content: { type: "string" },
          contentHtml: { type: "string", description: "Server-rendered via Bun.markdown.html()" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AgentStepEvent: {
        description:
          "One SSE `event: step` payload — a live tool-call progress update. Terminated by either " +
          "`event: final` (payload shape depends on the endpoint) or `event: error` ({ error: string }).",
        oneOf: [
          {
            type: "object",
            properties: { type: { const: "tool_call" }, name: { type: "string" }, args: {} },
          },
          {
            type: "object",
            properties: { type: { const: "tool_result" }, name: { type: "string" }, result: { type: "string" } },
          },
          { type: "object", properties: { type: { const: "compiling" } } },
        ],
      },
    },
  },
  security: [{ cookieAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["Auth"],
        summary: "Liveness check",
        security: [],
        responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } } },
      },
    },
    "/api/auth/{action}": {
      post: {
        tags: ["Auth"],
        summary: "Better Auth handler (sign-up, sign-in, sign-out, session, ...)",
        description:
          "Mounted wholesale from the better-auth library at /api/auth/*. See " +
          "https://www.better-auth.com/docs for the full route list (sign-up/email, sign-in/email, " +
          "sign-out, get-session, etc). Password hashing uses Bun's native argon2id.",
        security: [],
        parameters: [{ name: "action", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Depends on the Better Auth action" } },
      },
    },
    "/api/ingest/orders": {
      post: {
        tags: ["Ingestion"],
        summary: "Upload orders.csv",
        description: "Replaces the user's current orders. Runs the screener (parse, normalize, flag) before storing.",
        requestBody: { required: true, content: { "text/csv": { schema: { type: "string" } } } },
        responses: { "200": { description: "Row counts and flags found" } },
      },
    },
    "/api/ingest/payments": {
      post: {
        tags: ["Ingestion"],
        summary: "Upload payments.csv",
        requestBody: { required: true, content: { "text/csv": { schema: { type: "string" } } } },
        responses: { "200": { description: "Row counts and flags found" } },
      },
    },
    "/api/ingest/check": {
      post: {
        tags: ["Ingestion"],
        summary: "Re-run the screener against already-stored orders/payments",
        responses: { "200": { description: "Refreshed flag list" } },
      },
    },
    "/api/ingest/flags": {
      get: {
        tags: ["Ingestion"],
        summary: "List screening flags for the current dataset",
        responses: {
          "200": {
            description: "Flags grouped by type",
            content: { "application/json": { schema: { type: "object", properties: { flags: { type: "array", items: { type: "object" } } } } } },
          },
        },
      },
    },
    "/api/ingest/flags/{id}/rows": {
      get: {
        tags: ["Ingestion"],
        summary: "Rows behind one group flag (duplicate id / multiple payments), for Compare rows",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "{ source: 'orders'|'payments', rows: [...] }" } },
      },
    },
    "/api/ingest/rows/{source}/{id}": {
      post: {
        tags: ["Ingestion"],
        summary: "Include/exclude one order or payment row from reconciliation",
        parameters: [
          { name: "source", in: "path", required: true, schema: { type: "string", enum: ["orders", "payments"] } },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { isExcluded: { type: "boolean" } } } } },
        },
        responses: { "200": { description: "Updated row" } },
      },
    },
    "/api/ingest/flags/{id}/acknowledge": {
      post: {
        tags: ["Ingestion"],
        summary: "Acknowledge one flag (reviewed, no data change)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Updated flag" } },
      },
    },
    "/api/ingest/flags/acknowledge": {
      post: {
        tags: ["Ingestion"],
        summary: "Acknowledge every open flag at once",
        responses: { "200": { description: "Count acknowledged" } },
      },
    },
    "/api/ingest/flags/{id}/exclude": {
      post: {
        tags: ["Ingestion"],
        summary: "Exclude the row(s) behind one flag from reconciliation",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Updated flag" } },
      },
    },
    "/api/data/status": {
      get: {
        tags: ["Data"],
        summary: "Row counts and last upload/reconcile timestamps for the current user",
        responses: { "200": { description: "Dataset status" } },
      },
    },
    "/api/data": {
      delete: {
        tags: ["Data"],
        summary: "Wipe the current user's orders, payments, flags, reconciliations, and explanations",
        responses: { "204": { description: "Cleared" } },
      },
    },
    "/api/reconcile/run": {
      post: {
        tags: ["Reconciliation"],
        summary: "Recompute reconciliations from current (non-excluded) orders/payments",
        description: "Deterministic matching only — classifies each pair into one of 7 discrepancy types. No LLM call.",
        responses: { "200": { description: "Summary of the run" } },
      },
    },
    "/api/dashboard/summary": {
      get: {
        tags: ["Dashboard"],
        summary: "Headline figures: totals, value reconciled/in dispute, money at risk, breakdown by type",
        responses: { "200": { description: "Summary" } },
      },
    },
    "/api/dashboard/insight": {
      get: {
        tags: ["Dashboard"],
        summary: "Fetch the cached portfolio-level AI insight, if one has been generated",
        responses: {
          "200": {
            description: "{ insight: Explanation | null, createdAt: string | null }",
            content: { "application/json": { schema: { type: "object", properties: { insight: { anyOf: [{ $ref: "#/components/schemas/Explanation" }, { type: "null" }] } } } } },
          },
        },
      },
      post: {
        tags: ["Dashboard"],
        summary: "Generate (or regenerate) the portfolio-level AI insight",
        description:
          "Streams live agent progress over SSE, then a final `event: final` with `{ insight: Explanation, createdAt }`. " +
          "The result is cached (one row per user, replaced on regenerate).",
        responses: {
          "200": {
            description: "text/event-stream — events: step (AgentStepEvent), final, error",
            content: { "text/event-stream": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/api/dashboard/chat/messages": {
      get: {
        tags: ["Dashboard"],
        summary: "Whole-reconciliation chat history",
        responses: {
          "200": {
            description: "{ messages: ChatMessage[] }",
            content: { "application/json": { schema: { type: "object", properties: { messages: { type: "array", items: { $ref: "#/components/schemas/ChatMessage" } } } } } },
          },
        },
      },
      post: {
        tags: ["Dashboard"],
        summary: "Ask a follow-up about the whole reconciliation",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } } },
        },
        responses: {
          "200": {
            description: "text/event-stream — events: step (AgentStepEvent), final ({ message: ChatMessage }), error",
            content: { "text/event-stream": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/api/discrepancies": {
      get: {
        tags: ["Discrepancies"],
        summary: "Filterable/searchable drill-down list",
        parameters: [
          { name: "type", in: "query", schema: { $ref: "#/components/schemas/DiscrepancyType" } },
          { name: "search", in: "query", description: "Matches order id, transaction ref, or customer email", schema: { type: "string" } },
        ],
        responses: { "200": { description: "{ discrepancies: [...] }" } },
      },
    },
    "/api/discrepancies/{id}": {
      get: {
        tags: ["Discrepancies"],
        summary: "One discrepancy plus its linked order/payment rows",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Discrepancy detail" }, "404": { description: "Not found" } },
      },
    },
    "/api/discrepancies/{id}/explain": {
      post: {
        tags: ["Discrepancies"],
        summary: "Generate (or fetch cached) LLM explanation for one discrepancy",
        description:
          "Returns a plain JSON `{ explanation, cached: true }` immediately if already cached; otherwise streams " +
          "live agent progress over SSE with a final `event: final` carrying `{ explanation, cached: false }`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": {
            description: "application/json (cache hit) or text/event-stream (generating)",
            content: {
              "application/json": { schema: { type: "object", properties: { explanation: { $ref: "#/components/schemas/Explanation" }, cached: { type: "boolean" } } } },
              "text/event-stream": { schema: { type: "string" } },
            },
          },
          "502": { description: "explanation_unavailable — LLM call failed after retry" },
        },
      },
    },
    "/api/discrepancies/explain-batch": {
      post: {
        tags: ["Discrepancies"],
        summary: "Summarize a set of discrepancies together (up to 20 ids)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { ids: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 20 } }, required: ["ids"] } } },
        },
        responses: {
          "200": { description: "{ explanation: Explanation }" },
          "502": { description: "explanation_unavailable" },
        },
      },
    },
    "/api/discrepancies/{id}/messages": {
      get: {
        tags: ["Discrepancies"],
        summary: "Discuss-tab chat history for one discrepancy",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "{ messages: ChatMessage[] }" } },
      },
      post: {
        tags: ["Discrepancies"],
        summary: "Ask a follow-up about one discrepancy",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } } },
        },
        responses: {
          "200": {
            description: "text/event-stream — events: step (AgentStepEvent), final ({ message: ChatMessage }), error",
            content: { "text/event-stream": { schema: { type: "string" } } },
          },
          "404": { description: "Not found" },
        },
      },
    },
  },
} as const;
