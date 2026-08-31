import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

// Runtime connection: authenticates as the `app_user` Postgres role, which
// has no BYPASSRLS and is subject to the RLS policies in sql/002_roles_rls.sql.
// Never use this for cross-user queries without withUserContext().
const appSql = new SQL(requireEnv("APP_DATABASE_URL"));
export const db = drizzle({ client: appSql, schema });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
