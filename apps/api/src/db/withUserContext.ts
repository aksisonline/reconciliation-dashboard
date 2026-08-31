import { sql } from "drizzle-orm";
import { db } from "./client";

/**
 * Every business-data query must run through here. It opens a transaction,
 * sets the Postgres session variable the RLS policies key off (`app.user_id`),
 * then hands the transaction to the callback. SET LOCAL is transaction-scoped,
 * so pooled connections can never leak one request's user context into another.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
