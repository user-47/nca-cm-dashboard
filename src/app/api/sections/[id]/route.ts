import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sections, assets } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { sectionOrgId } from "@/lib/announcements";
import { apiError, apiOk, handle } from "@/lib/api";

const patchSchema = z.object({
  text: z.string().max(4000).optional(),
  posterAssetId: z.string().uuid().nullable().optional(),
  audioAssetId: z.string().uuid().nullable().optional(),
  audioSource: z.enum(["recorded", "tts"]).optional(),
  voiceId: z.string().uuid().nullable().optional(),
  durationMs: z.number().int().positive().nullable().optional(),
  // Offset into the announcement's narration. Zero is valid: it is where the
  // first section starts.
  startMs: z.number().int().min(0).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    if ((await sectionOrgId(params.id)) !== user.orgId) {
      return apiError("That section is not here.", 404);
    }

    const patch = patchSchema.parse(await request.json());
    const update: Record<string, unknown> = { ...patch, updatedAt: new Date() };

    // Attaching audio settles the card's width. Prefer a duration the browser
    // measured; fall back to whatever the asset carries from its upload.
    if (patch.audioAssetId) {
      if (patch.durationMs == null) {
        const asset = await db.query.assets.findFirst({
          where: eq(assets.id, patch.audioAssetId),
        });
        const fromMeta = asset?.metaJson?.durationMs;
        if (typeof fromMeta === "number") update.durationMs = Math.round(fromMeta);
      }
    } else if (patch.audioAssetId === null) {
      // Clearing the audio must clear the width too, or the strip lies.
      update.durationMs = null;
    }

    const [section] = await db
      .update(sections)
      .set(update)
      .where(eq(sections.id, params.id))
      .returning();

    return apiOk(section);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    if ((await sectionOrgId(params.id)) !== user.orgId) {
      return apiError("That section is not here.", 404);
    }

    await db.delete(sections).where(eq(sections.id, params.id));
    return apiOk({ ok: true });
  });
}
