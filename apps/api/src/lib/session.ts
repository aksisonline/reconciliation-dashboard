import type { MiddlewareHandler } from "hono";
import { auth } from "./auth";
import type { AppEnv } from "../types";

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("userId", session.user.id);
  await next();
};
