import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { templateMeta, type TemplateMeta, type BrandTokens } from "@nca/brand-tokens";
import { db } from "@/db";
import { brands, posters, renders, assets, templates } from "@/db/schema";
import { presignGet } from "@/lib/s3";

/**
 * Reads for the poster creator. Everything here is org-scoped through the
 * brand, which is the tenant boundary: a poster reaches its church only via
 * `brands.org_id`, so there is no way to list one belonging to another.
 */

export type BrandOption = {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  tokens: BrandTokens;
  /** The brand's mark, when one has been uploaded. */
  logo: { assetId: string; filename: string; minioKey: string } | null;
};

export async function listBrands(orgId: string): Promise<BrandOption[]> {
  const rows = await db.query.brands.findMany({
    where: and(eq(brands.orgId, orgId), isNull(brands.deletedAt)),
    orderBy: [desc(brands.isDefault), brands.name],
    with: { logo: { columns: { id: true, filename: true, minioKey: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    isDefault: row.isDefault,
    tokens: row.tokensJson as unknown as BrandTokens,
    logo: row.logo
      ? { assetId: row.logo.id, filename: row.logo.filename, minioKey: row.logo.minioKey }
      : null,
  }));
}

export async function listTemplates(): Promise<TemplateMeta[]> {
  const rows = await db.query.templates.findMany({
    where: eq(templates.active, true),
    orderBy: templates.name,
  });

  // Parsed rather than cast: these drive a generated form, and a malformed
  // slot list would render inputs that cannot be filled in correctly.
  return rows.map((row) =>
    templateMeta.parse({
      id: row.id,
      version: row.version,
      name: row.name,
      description: row.description ?? undefined,
      supportedRatios: row.supportedRatios,
      slots: row.slotsJson,
    })
  );
}

export type PosterListItem = {
  id: string;
  name: string | null;
  templateId: string;
  templateVersion: string;
  brandName: string;
  width: number;
  height: number;
  updatedAt: Date;
  /** Presigned URL of the most recent render, if one exists. */
  thumbnailUrl: string | null;
};

export async function listPosters(orgId: string): Promise<PosterListItem[]> {
  const rows = await db
    .select({
      id: posters.id,
      name: posters.name,
      templateId: posters.templateId,
      templateVersion: posters.templateVersion,
      brandName: brands.name,
      width: posters.width,
      height: posters.height,
      updatedAt: posters.updatedAt,
      // The newest render's object key, or null if it has never been drawn.
      latestKey: sql<string | null>`(
        select a.minio_key
        from renders r
        join assets a on a.id = r.asset_id
        where r.poster_id = ${posters.id}
        order by r.created_at desc
        limit 1
      )`,
    })
    .from(posters)
    .innerJoin(brands, eq(brands.id, posters.brandId))
    .where(and(eq(brands.orgId, orgId), isNull(posters.deletedAt)))
    .orderBy(desc(posters.updatedAt))
    .limit(100);

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      brandName: row.brandName,
      width: row.width,
      height: row.height,
      updatedAt: row.updatedAt,
      thumbnailUrl: row.latestKey ? await presignGet(row.latestKey) : null,
    }))
  );
}

export type PosterDetail = {
  id: string;
  name: string | null;
  brandId: string;
  templateId: string;
  templateVersion: string;
  params: Record<string, string>;
  width: number;
  height: number;
  latestRenderUrl: string | null;
};

export async function loadPoster(
  id: string,
  orgId: string
): Promise<PosterDetail | null> {
  const rows = await db
    .select({ p: posters, orgId: brands.orgId })
    .from(posters)
    .innerJoin(brands, eq(brands.id, posters.brandId))
    .where(and(eq(posters.id, id), eq(brands.orgId, orgId), isNull(posters.deletedAt)))
    .limit(1);

  const found = rows[0];
  if (!found) return null;

  const latest = await db
    .select({ key: assets.minioKey })
    .from(renders)
    .innerJoin(assets, eq(assets.id, renders.assetId))
    .where(eq(renders.posterId, id))
    .orderBy(desc(renders.createdAt))
    .limit(1);

  return {
    id: found.p.id,
    name: found.p.name,
    brandId: found.p.brandId,
    templateId: found.p.templateId,
    templateVersion: found.p.templateVersion,
    params: (found.p.paramsJson ?? {}) as Record<string, string>,
    width: found.p.width,
    height: found.p.height,
    latestRenderUrl: latest[0] ? await presignGet(latest[0].key) : null,
  };
}

/** Confirms a brand belongs to this church before anything is written to it. */
export async function brandBelongsToOrg(
  brandId: string,
  orgId: string
): Promise<boolean> {
  const row = await db.query.brands.findFirst({
    where: and(
      eq(brands.id, brandId),
      eq(brands.orgId, orgId),
      isNull(brands.deletedAt)
    ),
    columns: { id: true },
  });
  return Boolean(row);
}
