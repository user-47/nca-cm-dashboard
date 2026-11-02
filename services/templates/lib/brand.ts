import { and, eq, isNull, or } from "drizzle-orm";
import { brandTokens, type BrandTokens } from "@nca/brand-tokens";
import { db, schema } from "./db";

/**
 * Loads a brand by id or slug and validates its tokens.
 *
 * Validation is not ceremony here. These tokens become CSS custom properties,
 * and an unvalidated colour string goes straight into a style attribute. Parsing
 * with the same schema the dashboard wrote with means a malformed brand fails
 * loudly at render rather than producing a poster with a broken palette that
 * nobody notices until it is printed.
 */
export type LoadedBrand = {
  id: string;
  slug: string;
  name: string;
  tokens: BrandTokens;
  /** Presigned when the brand has a logo asset. Null is normal. */
  logoUrl: string | null;
};

export async function loadBrand(idOrSlug: string): Promise<LoadedBrand | null> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  const row = await db.query.brands.findFirst({
    where: and(
      isUuid ? eq(schema.brands.id, idOrSlug) : eq(schema.brands.slug, idOrSlug),
      isNull(schema.brands.deletedAt)
    ),
  });

  if (!row) return null;

  const parsed = brandTokens.safeParse(row.tokensJson);
  if (!parsed.success) {
    throw new Error(
      `Brand "${row.slug}" has tokens that do not validate: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`
    );
  }

  /**
   * Resolved to this app's own image route, not to a presigned URL: the same
   * host problem as every other image a template draws. A presigned URL is
   * signed for the address a browser uses, and the renderer sits elsewhere.
   *
   * A brand without a logo is normal — templates fall back to the church name
   * as a wordmark, so the absence reads as a design choice rather than a gap.
   */
  let logoUrl: string | null = null;
  if (row.logoAssetId) {
    const logo = await db.query.assets.findFirst({
      where: eq(schema.assets.id, row.logoAssetId),
      columns: { minioKey: true },
    });
    if (logo) {
      logoUrl = `/api/image/${logo.minioKey
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tokens: parsed.data,
    logoUrl,
  };
}
