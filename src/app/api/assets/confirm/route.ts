import { z } from "zod";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { headObject, presignGet } from "@/lib/s3";
import { apiError, apiOk, handle } from "@/lib/api";

const schema = z.object({
  key: z.string().min(1),
  kind: z.enum(["audio", "image", "video", "poster"]),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  // The browser can measure audio and video length itself, which lets the
  // Section Strip take its true width without waiting on a pipeline.
  durationMs: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await request.json());

    // The key is built server-side and namespaced by org, so this also blocks
    // one org from claiming another's object.
    if (!body.key.startsWith(`${user.orgId}/`)) {
      return apiError("That upload does not belong to this church.", 403);
    }

    const head = await headObject(body.key);
    if (!head.exists) {
      return apiError(
        "The upload did not finish. Try attaching the file again.",
        409
      );
    }

    const meta: Record<string, unknown> = {};
    if (body.durationMs) meta.durationMs = body.durationMs;
    if (body.width) meta.width = body.width;
    if (body.height) meta.height = body.height;

    const [asset] = await db
      .insert(assets)
      .values({
        orgId: user.orgId,
        kind: body.kind,
        minioKey: body.key,
        filename: body.filename,
        contentType: body.contentType,
        sizeBytes: head.size,
        metaJson: meta,
      })
      .returning();

    return apiOk({
      ...asset,
      // Both forms: the presigned url for showing it now, the key for storing.
      url: await presignGet(asset.minioKey),
      minioKey: asset.minioKey,
    });
  });
}
