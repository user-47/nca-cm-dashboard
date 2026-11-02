import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { poolStats } from "../playwright/pool";

/**
 * Reports whether this service can actually do its job, not merely whether the
 * process is listening. Compose gates on it, and so does anything that wants to
 * know the stack is ready rather than just up.
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    const checks: Record<string, boolean> = {};

    checks.playwright = poolStats().started;

    try {
      await db().execute(sql`select 1`);
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      const res = await fetch(`${config().TEMPLATES_URL}/api/health`, {
        signal: AbortSignal.timeout(4000),
      });
      checks.templates = res.ok;
    } catch {
      checks.templates = false;
    }

    const ok = Object.values(checks).every(Boolean);
    reply.code(ok ? 200 : 503);

    return {
      status: ok ? "ok" : "degraded",
      checks,
      playwrightPool: poolStats(),
    };
  });
}
