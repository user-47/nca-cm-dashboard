import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { brandTokens } from "@nca/brand-tokens";
import { db } from "@/db";
import { brands } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { apiError, apiOk, handle } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Give the brand a name.").max(80),
  tokens: brandTokens,
  makeDefault: z.boolean().default(false),
  /** The reference this was read from, when it came from a poster. */
  referenceId: z.string().uuid().nullish(),
});

/** "New Covenant Assembly" -> "new-covenant-assembly" */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "brand"
  );
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (user.role === "reviewer") {
      return apiError("Reviewers cannot add brands. Ask an admin.", 403);
    }

    const body = schema.parse(await request.json());

    // Slugs appear in render URLs and are unique per church, so a second
    // "Autumn Series" becomes autumn-series-2 rather than failing.
    const base = slugify(body.name);
    const taken = await db.query.brands.findMany({
      where: and(eq(brands.orgId, user.orgId), isNull(brands.deletedAt)),
      columns: { slug: true },
    });
    const used = new Set(taken.map((b) => b.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

    const brand = await db.transaction(async (tx) => {
      if (body.makeDefault) {
        await tx
          .update(brands)
          .set({ isDefault: false })
          .where(eq(brands.orgId, user.orgId));
      }
      const [row] = await tx
        .insert(brands)
        .values({
          orgId: user.orgId,
          slug,
          name: body.name.trim(),
          tokensJson: body.tokens,
          isDefault: body.makeDefault,
        })
        .returning();
      return row;
    });

    return apiOk({ id: brand.id, slug: brand.slug, name: brand.name }, 201);
  });
}
