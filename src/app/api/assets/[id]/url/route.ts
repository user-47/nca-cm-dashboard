import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { presignGet } from "@/lib/s3";
import { apiError, apiOk, handle } from "@/lib/api";

/** A fresh signed GET for an asset the person is allowed to see. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();

    const asset = await db.query.assets.findFirst({
      where: and(
        eq(assets.id, params.id),
        eq(assets.orgId, user.orgId),
        isNull(assets.deletedAt)
      ),
    });
    if (!asset) return apiError("That file is not here any more.", 404);

    return apiOk({ url: await presignGet(asset.minioKey) });
  });
}
