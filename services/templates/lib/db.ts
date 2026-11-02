import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../src/db/schema";

/**
 * Read-only access to the same database the dashboard writes.
 *
 * The schema is imported from the dashboard rather than redeclared here, so
 * there is one definition of `brands` and a column rename cannot leave this
 * service quietly reading a table that no longer looks like it thinks. That is
 * what `experimental.externalDir` in next.config.mjs is for.
 *
 * Lazy, for the same reason as the dashboard's: this module is walked at build
 * time, and an image should not need a live database to compile.
 */
const globalForDb = globalThis as unknown as {
  __templatesPool?: Pool;
  __templatesDb?: NodePgDatabase<typeof schema>;
};

function connect(): NodePgDatabase<typeof schema> {
  if (globalForDb.__templatesDb) return globalForDb.__templatesDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The templates app reads brands directly from the database."
    );
  }

  const pool = globalForDb.__templatesPool ?? new Pool({ connectionString: url, max: 5 });
  const instance = drizzle(pool, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__templatesPool = pool;
    globalForDb.__templatesDb = instance;
  }
  return instance;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const real = connect() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
