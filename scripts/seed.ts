import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import * as schema from "../src/db/schema";

/**
 * Creates the first church and its admin, so a fresh install has something to
 * sign in with. Safe to run more than once: it updates rather than duplicates.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const email = (process.env.ADMIN_EMAIL ?? "admin@example.church").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error(
      "Set ADMIN_PASSWORD to at least 10 characters before seeding."
    );
  }

  const orgName = process.env.ORG_NAME ?? "New Covenant Assembly";
  const orgSlug = process.env.ORG_SLUG ?? "new-covenant";
  const adminName = process.env.ADMIN_NAME ?? "Media lead";

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  const existingOrg = await db.query.orgs.findFirst({
    where: eq(schema.orgs.slug, orgSlug),
  });

  const org =
    existingOrg ??
    (
      await db
        .insert(schema.orgs)
        .values({ name: orgName, slug: orgSlug, themeJson: {} })
        .returning()
    )[0];

  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (existingUser) {
    await db
      .update(schema.users)
      .set({ passwordHash, role: "admin", deletedAt: null })
      .where(eq(schema.users.id, existingUser.id));
    console.log(`Reset the password for ${email}.`);
  } else {
    await db.insert(schema.users).values({
      orgId: org.id,
      email,
      name: adminName,
      passwordHash,
      role: "admin",
    });
    console.log(`Created ${email} as an admin at ${org.name}.`);
  }

  // A starter voice so the announcement builder can speak on day one. The id
  // matches Kokoro's default English voice.
  const anyVoice = await db.query.voices.findFirst({
    where: eq(schema.voices.orgId, org.id),
  });
  if (!anyVoice) {
    await db.insert(schema.voices).values({
      orgId: org.id,
      name: "Announcer",
      provider: "kokoro",
      providerVoiceId: "af_heart",
      language: "en",
      isDefault: true,
    });
    console.log("Added a default Kokoro voice. Test it in Settings.");
  }

  await pool.end();
}

main().catch((cause) => {
  console.error("Seed failed:", cause);
  process.exit(1);
});
