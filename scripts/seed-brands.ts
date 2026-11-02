import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { SEED_BRANDS } from "../packages/brand-tokens/src/seed/nca";
import { SEED_TEMPLATES } from "../packages/brand-tokens/src/seed/templates";

/**
 * Seeds the poster creator: the brands that ship with the product, and the
 * registration rows for the templates that exist in code.
 *
 * Idempotent. Re-running updates in place rather than duplicating, so it is
 * safe to run on every deploy and is how a template gains a new slot.
 *
 *   npm run db:seed-brands
 *
 * Requires an org to exist, so run `npm run db:seed` first on a fresh install.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  // Brands are org-scoped, so seeding needs to know which church. Prefer the
  // slug the Phase 1 seed used; otherwise take the only org there is.
  const wantedSlug = process.env.ORG_SLUG ?? "new-covenant";
  let org = await db.query.orgs.findFirst({
    where: eq(schema.orgs.slug, wantedSlug),
  });

  if (!org) {
    const all = await db.query.orgs.findMany({ limit: 2 });
    if (all.length === 1) {
      org = all[0];
      console.log(`No org with slug "${wantedSlug}". Using the only one: ${org.name}.`);
    } else if (all.length === 0) {
      throw new Error(
        "No church exists yet. Run `npm run db:seed` first, then seed brands."
      );
    } else {
      throw new Error(
        `More than one church exists and none has slug "${wantedSlug}". ` +
          `Set ORG_SLUG to the one you mean.`
      );
    }
  }

  /* ------------------------------------------------------------- brands */

  for (const seed of SEED_BRANDS) {
    // Exactly one default per church, or a new poster inherits at random.
    if (seed.isDefault) {
      await db
        .update(schema.brands)
        .set({ isDefault: false })
        .where(eq(schema.brands.orgId, org.id));
    }

    const [row] = await db
      .insert(schema.brands)
      .values({
        orgId: org.id,
        slug: seed.slug,
        name: seed.name,
        tokensJson: seed.tokens,
        isDefault: seed.isDefault,
      })
      .onConflictDoUpdate({
        target: [schema.brands.orgId, schema.brands.slug],
        set: {
          name: seed.name,
          tokensJson: seed.tokens,
          isDefault: seed.isDefault,
          deletedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    console.log(`Brand "${row.name}" (${row.slug}) is up to date.`);
  }

  /* ---------------------------------------------------------- templates */

  for (const meta of SEED_TEMPLATES) {
    const [row] = await db
      .insert(schema.templates)
      .values({
        id: meta.id,
        version: meta.version,
        name: meta.name,
        description: meta.description ?? null,
        slotsJson: meta.slots,
        supportedRatios: meta.supportedRatios,
        active: true,
      })
      .onConflictDoUpdate({
        target: [schema.templates.id, schema.templates.version],
        set: {
          name: meta.name,
          description: meta.description ?? null,
          slotsJson: meta.slots,
          supportedRatios: meta.supportedRatios,
          active: true,
        },
      })
      .returning();

    console.log(
      `Template "${row.name}" ${row.version} registered with ${meta.slots.length} slots.`
    );
  }

  await pool.end();
}

main().catch((cause) => {
  console.error("Seeding brands failed:", cause);
  process.exit(1);
});
