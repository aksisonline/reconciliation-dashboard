import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { apiReference } from "@scalar/hono-api-reference";
import type { AppEnv } from "./types";
import { auth } from "./lib/auth";
import { requireSession } from "./lib/session";
import { openApiSpec } from "./openapi";
import { ingestRoutes } from "./routes/ingest";
import { dataRoutes } from "./routes/data";
import { reconcileRoutes } from "./routes/reconcile";
import { dashboardRoutes } from "./routes/dashboard";
import { discrepancyRoutes } from "./routes/discrepancies";
import { explainRoutes } from "./routes/explain";
import { chatRoutes } from "./routes/chat";

const app = new Hono<AppEnv>();

app.use(logger());
app.use(
  "*",
  cors({
    origin: (process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
    credentials: true,
  }),
);

app.get("/", (c) => c.text("API is healthy. For docs, go to /docs"));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/openapi.json", (c) => c.json(openApiSpec));
app.get("/docs", apiReference({ url: "/openapi.json", pageTitle: "Reconciliation Dashboard API" }));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use("/api/*", requireSession);
app.route("/api/ingest", ingestRoutes);
app.route("/api/data", dataRoutes);
app.route("/api/reconcile", reconcileRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/discrepancies", discrepancyRoutes);
app.route("/api/discrepancies", explainRoutes);
app.route("/api/discrepancies", chatRoutes);

export default {
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
};
