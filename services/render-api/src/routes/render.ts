import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  brandTokens,
  paramsSchemaFor,
  templateMeta,
  type TemplateMeta,
} from "@nca/brand-tokens";
import { config } from "../lib/config";
import { db, schema } from "../lib/db";
import { logger } from "../lib/logger";
import { screenshot } from "../playwright/screenshot";
import { presignGet, putObject } from "../storage/minio";
import { ApiError } from "../lib/errors";

const bodySchema = z.object({
  brandId: z.string().uuid(),
  template: z.string().min(1),
  templateVersion: z.string().default("v1"),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  width: z.number().int().min(200).max(4096),
  height: z.number().int().min(200).max(4096),
  format: z.enum(["png", "jpeg"]).default("png"),
  /** When given, a `renders` row is recorded against it. */
  posterId: z.string().uuid().nullish(),
});

const CONTENT_TYPE = { png: "image/png", jpeg: "image/jpeg" } as const;
const EXTENSION = { png: "png", jpeg: "jpg" } as const;

/**
 * The object key is derived from everything that affects the picture, not from
 * a random id.
 *
 * Two consequences worth having. Re-rendering an unchanged poster overwrites
 * the same object instead of littering the bucket with identical files, and
 * "did this change?" becomes a key comparison rather than an image diff.
 */
function objectKey(
  input: Record<string, unknown>,
  format: "png" | "jpeg",
  when: Date
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 32);

  const yyyy = when.getUTCFullYear();
  const mm = String(when.getUTCMonth() + 1).padStart(2, "0");

  return `${config().RENDER_MINIO_PREFIX}${yyyy}/${mm}/${hash}.${EXTENSION[format]}`;
}

export async function renderRoutes(app: FastifyInstance) {
  app.post("/render", async (request) => {
    const body = bodySchema.parse(request.body);

    /* ------------------------------------------------------------ brand */

    const brand = await db().query.brands.findFirst({
      where: and(
        eq(schema.brands.id, body.brandId),
        isNull(schema.brands.deletedAt)
      ),
    });
    if (!brand) throw new ApiError(404, "BRAND_NOT_FOUND", "That brand does not exist.");

    // Validated here as well as in the templates app, because a brand with a
    // malformed palette should fail before a browser is spun up for it.
    const tokens = brandTokens.safeParse(brand.tokensJson);
    if (!tokens.success) {
      throw new ApiError(
        422,
        "BRAND_INVALID",
        `Brand "${brand.slug}" has tokens that do not validate.`,
        tokens.error.issues
      );
    }

    /* --------------------------------------------------------- template */

    const templateRow = await db().query.templates.findFirst({
      where: and(
        eq(schema.templates.id, body.template),
        eq(schema.templates.version, body.templateVersion)
      ),
    });
    if (!templateRow || !templateRow.active) {
      throw new ApiError(
        404,
        "TEMPLATE_NOT_FOUND",
        `No active template "${body.template}" at ${body.templateVersion}.`
      );
    }

    const meta: TemplateMeta = templateMeta.parse({
      id: templateRow.id,
      version: templateRow.version,
      name: templateRow.name,
      description: templateRow.description ?? undefined,
      supportedRatios: templateRow.supportedRatios,
      slots: templateRow.slotsJson,
    });

    // Strict here, unlike the preview: this commits an artifact, so a missing
    // required slot must be a refusal rather than a half-drawn poster.
    const params = paramsSchemaFor(meta).safeParse(body.params);
    if (!params.success) {
      throw new ApiError(
        400,
        "PARAMS_INVALID",
        params.error.issues[0]?.message ?? "Those template values are not valid.",
        params.error.issues
      );
    }

    /* ----------------------------------------------------------- poster */

    if (body.posterId) {
      const poster = await db().query.posters.findFirst({
        where: eq(schema.posters.id, body.posterId),
      });
      if (!poster) {
        throw new ApiError(404, "POSTER_NOT_FOUND", "That poster does not exist.");
      }
      // A poster reaches its org through its brand, so rendering one against a
      // different brand would cross a tenant boundary.
      if (poster.brandId !== brand.id) {
        throw new ApiError(
          400,
          "POSTER_BRAND_MISMATCH",
          "That poster belongs to a different brand."
        );
      }
    }

    /* ----------------------------------------------------------- render */

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params.data)) {
      if (value !== undefined && value !== null) query.set(key, String(value));
    }
    query.set("v", meta.version);
    query.set("w", String(body.width));
    query.set("h", String(body.height));

    const url = `${config().TEMPLATES_URL}/render/${brand.id}/${meta.id}?${query.toString()}`;

    const { buffer, renderMs } = await screenshot({
      url,
      width: body.width,
      height: body.height,
      format: body.format,
    });

    /* ---------------------------------------------------------- storage */

    const key = objectKey(
      {
        brand: brand.id,
        tokens: tokens.data,
        template: meta.id,
        version: meta.version,
        params: params.data,
        width: body.width,
        height: body.height,
        format: body.format,
      },
      body.format,
      new Date()
    );

    await putObject(key, buffer, CONTENT_TYPE[body.format]);

    /* ---------------------------------------------------------- records */

    // The PNG becomes an ordinary asset, which is what makes a rendered poster
    // immediately usable as a section poster in the announcement builder.
    const [asset] = await db()
      .insert(schema.assets)
      .values({
        orgId: brand.orgId,
        kind: "poster",
        minioKey: key,
        filename: `${meta.id}-${body.width}x${body.height}.${EXTENSION[body.format]}`,
        contentType: CONTENT_TYPE[body.format],
        sizeBytes: buffer.length,
        metaJson: {
          width: body.width,
          height: body.height,
          brandId: brand.id,
          template: `${meta.id}@${meta.version}`,
        },
      })
      .onConflictDoUpdate({
        target: schema.assets.minioKey,
        set: { sizeBytes: buffer.length },
      })
      .returning();

    if (body.posterId) {
      await db().insert(schema.renders).values({
        posterId: body.posterId,
        assetId: asset.id,
        renderMs,
      });
    }

    logger.info(
      {
        posterId: body.posterId ?? null,
        brandId: brand.id,
        template: `${meta.id}@${meta.version}`,
        width: body.width,
        height: body.height,
        renderMs,
        bytes: buffer.length,
        key,
      },
      "poster rendered"
    );

    return {
      url: await presignGet(key),
      key,
      assetId: asset.id,
      bytes: buffer.length,
      renderMs,
    };
  });
}
