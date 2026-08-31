import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client";
import * as schema from "../db/schema";

// Password hashing is delegated to Bun's native argon2id implementation
// instead of Better Auth's default JS scrypt — faster and one less thing
// for the JS runtime to do in software.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => Bun.password.hash(password, "argon2id"),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        Bun.password.verify(password, hash),
    },
  },
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: process.env.BETTER_AUTH_URL,
  advanced: {
    // Schema declares every id column as Postgres `uuid` with a DB-generated
    // default. Better Auth's own id generator produces non-UUID strings,
    // which fails the uuid column type — let Postgres generate ids instead.
    database: {
      generateId: false,
    },
    // Frontend and API are deployed as separate Railway services (different
    // subdomains), so the session cookie is cross-site from the browser's
    // point of view even though both live under the same Railway project.
    // SameSite=None+Secure is required for that. In local dev, frontend and
    // API are both on http://localhost (different ports only), which counts
    // as same-site, so plain Lax cookies work fine there without Secure.
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
