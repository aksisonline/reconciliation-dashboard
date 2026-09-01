import { Hono } from "hono";
import type { AppEnv } from "../types";
import { withUserContext } from "../db/withUserContext";
import { applyResolution, revertResolution, ResolutionError, type ResolveAction } from "../lib/resolution";

export const resolutionRoutes = new Hono<AppEnv>();

resolutionRoutes.post("/:id/resolve", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json<{ action: ResolveAction }>().catch(() => null);
  if (!body?.action?.kind) return c.json({ error: "action required" }, 400);

  try {
    const row = await withUserContext(userId, (tx) => applyResolution(tx, userId, id, body.action));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  } catch (err) {
    if (err instanceof ResolutionError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

resolutionRoutes.post("/:id/unresolve", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  try {
    const row = await withUserContext(userId, (tx) => revertResolution(tx, userId, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  } catch (err) {
    if (err instanceof ResolutionError) return c.json({ error: err.message }, 400);
    throw err;
  }
});
