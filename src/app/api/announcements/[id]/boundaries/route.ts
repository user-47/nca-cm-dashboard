import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { announcements, projects, sections } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadAnnouncement } from "@/lib/announcements";
import { apiError, apiOk, handle } from "@/lib/api";

/**
 * Where each section sits inside the narration.
 *
 * One request for the whole set rather than one per section, because a boundary
 * is a shared edge: moving it changes two sections at once, and saving those
 * separately would leave a gap or an overlap visible on the strip in between.
 * They are written in a transaction for the same reason.
 */
const bodySchema = z.object({
  spans: z
    .array(
      z.object({
        sectionId: z.string().uuid(),
        startMs: z.number().int().min(0),
        durationMs: z.number().int().positive(),
      })
    )
    .min(1, "Send at least one section."),
});

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const body = bodySchema.parse(await request.json());

    const owned = await db
      .select({ id: announcements.id })
      .from(announcements)
      .innerJoin(projects, eq(projects.id, announcements.projectId))
      .where(and(eq(announcements.id, params.id), eq(projects.orgId, user.orgId)))
      .limit(1);
    if (!owned[0]) return apiError("That announcement is not here.", 404);

    // Every section of this announcement, and only these. Writing a span onto a
    // section belonging to another announcement would be a silent corruption, so
    // it is checked rather than assumed.
    const rows = await db.query.sections.findMany({
      where: eq(sections.announcementId, params.id),
      orderBy: asc(sections.position),
      columns: { id: true },
    });
    const known = new Set(rows.map((r) => r.id));

    if (body.spans.length !== rows.length) {
      return apiError(
        "Those timings do not cover every section. Reload the page and try again.",
        422
      );
    }
    for (const span of body.spans) {
      if (!known.has(span.sectionId)) {
        return apiError(
          "Those timings refer to a section that is not here. Reload the page and try again.",
          422
        );
      }
    }

    const ordered = [...body.spans].sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < ordered.length; i++) {
      const previousEnd = ordered[i - 1].startMs + ordered[i - 1].durationMs;
      if (ordered[i].startMs !== previousEnd) {
        return apiError(
          "Those timings leave a gap or an overlap. Every section has to start where the one before it ended.",
          422
        );
      }
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      for (const span of body.spans) {
        await tx
          .update(sections)
          .set({ startMs: span.startMs, durationMs: span.durationMs, updatedAt: now })
          .where(eq(sections.id, span.sectionId));
      }
    });

    const view = await loadAnnouncement(params.id, user.orgId);
    return apiOk(view);
  });
}
