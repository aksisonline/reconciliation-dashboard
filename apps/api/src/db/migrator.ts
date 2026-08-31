import { SQL } from "bun";

// Standalone from client.ts on purpose: migrate.ts only needs DATABASE_URL
// (the `migrator` role), and must not require APP_DATABASE_URL to run.
export function migratorSql() {
  return new SQL(requireEnv("DATABASE_URL"));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
