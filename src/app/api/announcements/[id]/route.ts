import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { announcements, assets, projects, sections } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadAnnouncement } from "@/lib/announcements";
import { apiError, apiOk, handle } from "@/lib/api";

const patchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  introAssetId: z.string().uuid().nullable().optional(),
  outroAssetId: z.string().uuid().nullable().optional(),
  narrationAssetId: z.string().uuid().nullable().optional(),
});

/** The builder polls this while a render is in flight. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    const view = await loadAnnouncement(params.id, user.orgId);
    if (!view) return apiError("That announcement is not here.", 404);
    return apiOk(view);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    const patch = patchSchema.parse(await request.json());

    const owned = await db
      .select({ id: announcements.id, projectId: announcements.projectId })
      .from(announcements)
      .innerJoin(projects, eq(projects.id, announcements.projectId))
      .where(and(eq(announcements.id, params.id), eq(projects.orgId, user.orgId)))
      .limit(1);

    if (!owned[0]) return apiError("That announcement is not here.", 404);

    await db
      .update(announcements)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(announcements.id, params.id));

    /**
     * Removing the narration hands timing back to the per-section audio.
     *
     * `durationMs` means different things on the two paths — a span of the
     * recording in narration mode, the length of a section's own file otherwise
     * — so leaving the spans behind would have the Section Strip drawing widths
     * that no longer correspond to anything. Each section goes back to whatever
     * its own audio measured at upload, or to no width at all.
     */
    if (patch.narrationAssetId === null) {
      const rows = await db.query.sections.findMany({
        where: eq(sections.announcementId, params.id),
        columns: { id: true, audioAssetId: true },
      });
      for (const row of rows) {
        const audio = row.audioAssetId
          ? await db.query.assets.findFirst({ where: eq(assets.id, row.audioAssetId) })
          : null;
        const fromMeta = audio?.metaJson?.durationMs;
        await db
          .update(sections)
          .set({
            startMs: null,
            durationMs: typeof fromMeta === "number" ? Math.round(fromMeta) : null,
            updatedAt: new Date(),
          })
          .where(eq(sections.id, row.id));
      }
    }

    // Keep the project name in step with the title so Projects reads right.
    if (patch.title) {
      await db
        .update(projects)
        .set({ name: patch.title, updatedAt: new Date() })
        .where(eq(projects.id, owned[0].projectId));
    }

    const view = await loadAnnouncement(params.id, user.orgId);
    return apiOk(view);
  });
}
