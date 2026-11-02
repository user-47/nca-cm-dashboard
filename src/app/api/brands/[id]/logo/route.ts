import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { assets, brands } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { apiError, apiOk, handle } from "@/lib/api";

const schema = z.object({
  /** The uploaded image to use as the mark, or null to clear it. */
  assetId: z.string().uuid().nullable(),
});

/**
 * Set or clear a brand's logo.
 *
 * The mark is stored as a reference to an existing asset rather than a URL, so
 * the templates app can resolve it to an object key and stream it from MinIO.
 * A presigned URL cannot be used: it is signed for the browser's host, and the
 * renderer sits on a different network.
 *
 * Both the brand and the asset are looked up inside the caller's org. That
 * scoping is the tenant boundary — without it one church could point its brand
 * at another church's mark and render under their identity.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    if (user.role === "reviewer") {
      return apiError("Reviewers cannot change brands. Ask an admin.", 403);
    }

    const body = schema.parse(await request.json());

    const brand = await db.query.brands.findFirst({
      where: and(
        eq(brands.id, params.id),
        eq(brands.orgId, user.orgId),
        isNull(brands.deletedAt)
      ),
      columns: { id: true },
    });
    if (!brand) return apiError("That brand does not exist.", 404);

    if (body.assetId) {
      const asset = await db.query.assets.findFirst({
        where: and(
          eq(assets.id, body.assetId),
          eq(assets.orgId, user.orgId),
          isNull(assets.deletedAt)
        ),
        columns: { id: true, kind: true },
      });
      if (!asset) return apiError("That image does not exist.", 404);
      if (asset.kind !== "image") {
        return apiError("A logo has to be an image.", 422);
      }
    }

    await db
      .update(brands)
      .set({ logoAssetId: body.assetId })
      .where(and(eq(brands.id, params.id), eq(brands.orgId, user.orgId)));

    return apiOk({ id: params.id, logoAssetId: body.assetId });
  });
}
