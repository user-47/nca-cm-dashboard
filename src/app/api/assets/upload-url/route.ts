import { z } from "zod";
import { requireUser } from "@/lib/session";
import { buildKey, presignPut } from "@/lib/s3";
import { apiError, apiOk, handle } from "@/lib/api";

const schema = z.object({
  kind: z.enum(["audio", "image", "video", "poster"]),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().optional(),
});

/** Uploads over this cap should not be running through a church's laptop. */
const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const ALLOWED: Record<string, RegExp> = {
  audio: /^audio\//,
  image: /^image\//,
  poster: /^image\//,
  video: /^video\//,
};

/**
 * Hands the browser a short-lived PUT straight to MinIO. Bytes never pass
 * through this app.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await request.json());

    if (!ALLOWED[body.kind].test(body.contentType)) {
      return apiError(
        `That file is a ${body.contentType || "unknown type"}. This slot takes ${body.kind} files.`,
        422
      );
    }
    if (body.sizeBytes && body.sizeBytes > MAX_BYTES) {
      return apiError("That file is over the 2 GB limit.", 422);
    }

    const key = buildKey(user.orgId, body.kind, body.filename);
    const url = await presignPut(key, body.contentType);

    return apiOk({ uploadUrl: url, key });
  });
}
