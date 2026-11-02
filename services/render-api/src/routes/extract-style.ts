import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { config } from "../lib/config";
import { db, schema } from "../lib/db";
import { logger } from "../lib/logger";
import { ApiError } from "../lib/errors";
import { presignGet, putObject } from "../storage/minio";
import { extractStyle, isSupportedImageType } from "../style/extractor";

/**
 * Reads a brand out of an uploaded poster.
 *
 * The upload is kept whichever way the read goes. A reference that produced a
 * bad answer is the only evidence for diagnosing why, and a person who liked
 * the suggestion will want to see the poster it came from next to it.
 */
export async function extractStyleRoutes(app: FastifyInstance) {
  app.post("/extract-style", async (request) => {
    // A request with no multipart body at all throws rather than returning
    // null, so both shapes of "you did not attach anything" land here.
    const file = await request.file().catch(() => null);
    if (!file) {
      throw new ApiError(
        400,
        "NO_IMAGE",
        "Attach an image to read the brand from."
      );
    }

    if (!isSupportedImageType(file.mimetype)) {
      throw new ApiError(
        415,
        "UNSUPPORTED_IMAGE",
        `That file is a ${file.mimetype || "unknown type"}. Use a JPEG, PNG, GIF, or WebP.`
      );
    }

    const orgId = (request.headers["x-org-id"] as string | undefined)?.trim();
    if (!orgId) {
      throw new ApiError(
        400,
        "ORG_REQUIRED",
        "The dashboard must say which church this reference belongs to."
      );
    }

    const org = await db().query.orgs.findFirst({
      where: eq(schema.orgs.id, orgId),
      columns: { id: true },
    });
    if (!org) throw new ApiError(404, "ORG_NOT_FOUND", "That church is not here.");

    const bytes = await file.toBuffer();
    if (bytes.length === 0) {
      throw new ApiError(400, "EMPTY_IMAGE", "That file was empty.");
    }

    /* ------------------------------------------------------------ store */

    const extension = file.mimetype.split("/")[1]?.replace("jpeg", "jpg") ?? "img";
    const key = `${config().REFERENCE_MINIO_PREFIX}${orgId}/${randomUUID()}.${extension}`;
    await putObject(key, bytes, file.mimetype);

    const [asset] = await db()
      .insert(schema.assets)
      .values({
        orgId,
        kind: "image",
        minioKey: key,
        filename: file.filename || `reference.${extension}`,
        contentType: file.mimetype,
        sizeBytes: bytes.length,
        metaJson: { role: "style-reference" },
      })
      .returning();

    const [reference] = await db()
      .insert(schema.referencePosters)
      .values({ orgId, assetId: asset.id })
      .returning();

    /* ----------------------------------------------------------- extract */

    try {
      const result = await extractStyle(bytes, file.mimetype);

      await db()
        .update(schema.referencePosters)
        .set({ extractedTokens: result.tokens, errorText: null })
        .where(eq(schema.referencePosters.id, reference.id));

      return {
        referenceId: reference.id,
        assetId: asset.id,
        sourceUrl: await presignGet(key),
        tokens: result.tokens,
        model: result.model,
        usage: result.usage,
      };
    } catch (cause) {
      // Record why, so the row is not just a mystery null.
      const message =
        cause instanceof ApiError ? cause.message : "The read failed unexpectedly.";
      await db()
        .update(schema.referencePosters)
        .set({ errorText: message })
        .where(eq(schema.referencePosters.id, reference.id));

      logger.warn(
        { referenceId: reference.id, err: message },
        "style extraction failed"
      );
      throw cause;
    }
  });
}
