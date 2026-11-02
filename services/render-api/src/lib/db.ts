import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../../src/db/schema";
import { config } from "./config";

/**
 * The dashboard's schema, imported rather than redeclared, so a column rename
 * cannot leave this service quietly reading a table that no longer looks like
 * it thinks.
 */
let pool: Pool | null = null;
let instance: NodePgDatabase<typeof schema> | null = null;

export function db(): NodePgDatabase<typeof schema> {
  if (!instance) {
    pool = new Pool({ connectionString: config().DATABASE_URL, max: 5 });
    instance = drizzle(pool, { schema });
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
  instance = null;
}

export { schema };
