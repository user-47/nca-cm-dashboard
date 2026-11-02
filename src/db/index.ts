import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";

/**
 * The connection is built on first use, not at import.
 *
 * Next walks every route at build time to collect page data, which imports
 * this module. Constructing the pool up here would mean the image could not be
 * built without a live DATABASE_URL, and a build-time secret is exactly what a
 * self-hosted install should not need.
 *
 * The pool is also hung off globalThis in development, because Next reloads
 * modules on every edit and a fresh pool per reload exhausts Postgres.
 */
const globalForDb = globalThis as unknown as {
  __ncaPool?: Pool;
  __ncaDb?: NodePgDatabase<typeof schema>;
};

function connect(): NodePgDatabase<typeof schema> {
  if (globalForDb.__ncaDb) return globalForDb.__ncaDb;

  const pool =
    globalForDb.__ncaPool ??
    new Pool({ connectionString: env().DATABASE_URL, max: 10 });

  const instance = drizzle(pool, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__ncaPool = pool;
    globalForDb.__ncaDb = instance;
  }
  return instance;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const real = connect() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    // Drizzle's methods rely on `this`, so hand back a bound copy rather than
    // a loose reference.
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
