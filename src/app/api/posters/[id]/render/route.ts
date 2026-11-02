import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRenderClient, RenderApiError } from "@nca/render-client";
import { db } from "@/db";
import { posters } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadPoster } from "@/lib/posters";
import { env } from "@/lib/env";
import { apiError, apiOk, handle } from "@/lib/api";

const schema = z
  .object({
    params: z.record(z.string()).optional(),
    width: z.number().int().min(200).max(4096).optional(),
    height: z.number().int().min(200).max(4096).optional(),
  })
  .default({});

/** Draws an existing poster again, optionally with edited values. */
export async function POST(
  request: Request,
  { params: routeParams }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();

    const poster = await loadPoster(routeParams.id, user.orgId);
    if (!poster) return apiError("That poster is not here.", 404);

    const body = schema.parse(await request.json().catch(() => ({})));

    const next = {
      params: body.params ?? poster.params,
      width: body.width ?? poster.width,
      height: body.height ?? poster.height,
    };

    // Persist the edit before drawing, so what is stored always matches what
    // the newest render shows.
    if (body.params || body.width || body.height) {
      await db
        .update(posters)
        .set({
          paramsJson: next.params,
          width: next.width,
          height: next.height,
          updatedAt: new Date(),
        })
        .where(eq(posters.id, poster.id));
    }

    try {
      const result = await createRenderClient({
        baseUrl: env().RENDER_API_URL,
      }).render({
        brandId: poster.brandId,
        template: poster.templateId,
        templateVersion: poster.templateVersion,
        params: next.params,
        width: next.width,
        height: next.height,
        posterId: poster.id,
      });

      return apiOk({ posterId: poster.id, ...result });
    } catch (cause) {
      if (cause instanceof RenderApiError) {
        return apiError(cause.message, cause.status === 504 ? 504 : 422);
      }
      throw cause;
    }
  });
}
