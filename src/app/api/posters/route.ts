import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRenderClient, RenderApiError } from "@nca/render-client";
import { db } from "@/db";
import { posters } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { brandBelongsToOrg, listTemplates } from "@/lib/posters";
import { env } from "@/lib/env";
import { apiError, apiOk, handle } from "@/lib/api";

const schema = z.object({
  brandId: z.string().uuid(),
  templateId: z.string().min(1),
  templateVersion: z.string().default("v1"),
  name: z.string().max(120).nullish(),
  params: z.record(z.string()).default({}),
  width: z.number().int().min(200).max(4096),
  height: z.number().int().min(200).max(4096),
});

/**
 * Creates a poster and draws it in one step.
 *
 * Saving and rendering are separate concepts in the database — a poster is the
 * recipe, a render is one time it was drawn — but from the person's side there
 * is one button, so this does both and reports the picture.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await request.json());

    if (!(await brandBelongsToOrg(body.brandId, user.orgId))) {
      return apiError("That brand is not here.", 404);
    }

    const template = (await listTemplates()).find(
      (t) => t.id === body.templateId && t.version === body.templateVersion
    );
    if (!template) return apiError("That template is not here.", 404);

    const [poster] = await db
      .insert(posters)
      .values({
        brandId: body.brandId,
        templateId: body.templateId,
        templateVersion: body.templateVersion,
        name: body.name ?? null,
        paramsJson: body.params,
        width: body.width,
        height: body.height,
        createdBy: user.id,
      })
      .returning();

    try {
      const result = await createRenderClient({
        baseUrl: env().RENDER_API_URL,
      }).render({
        brandId: body.brandId,
        template: body.templateId,
        templateVersion: body.templateVersion,
        params: body.params,
        width: body.width,
        height: body.height,
        posterId: poster.id,
      });

      return apiOk({ posterId: poster.id, ...result }, 201);
    } catch (cause) {
      if (cause instanceof RenderApiError) {
        // The poster row stays. The recipe is worth keeping even when this
        // attempt to draw it failed, so the person can fix a value and retry
        // rather than retyping everything.
        return apiError(cause.message, cause.status === 504 ? 504 : 422);
      }
      throw cause;
    }
  });
}
