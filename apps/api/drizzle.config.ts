import { defineConfig } from "drizzle-kit";

// Used for `bun db:generate` when evolving the schema going forward.
// Initial schema + roles + RLS are hand-written in sql/ and applied by
// src/db/migrate.ts, since role/RLS setup isn't something drizzle-kit
// diffs from schema.ts.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
