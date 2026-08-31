import { Hono } from "hono";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import { runReconciliation } from "../lib/reconcile";

export const reconcileRoutes = new Hono<AppEnv>();

reconcileRoutes.post("/run", async (c) => {
  const userId = c.get("userId");
  const result = await withUserContext(userId, (tx) => runReconciliation(tx, userId));
  return c.json(result);
});
