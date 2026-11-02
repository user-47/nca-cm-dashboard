import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { announcements, projects, sections, voices } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadAnnouncement } from "@/lib/announcements";
import { apiError, apiOk, handle } from "@/lib/api";

const createSchema = z.object({
  text: z.string().max(4000).default(""),
});

const reorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

async function assertOwned(announcementId: string, orgId: string) {
  const rows = await db
    .select({ id: announcements.id })
    .from(announcements)
    .innerJoin(projects, eq(projects.id, announcements.projectId))
    .where(and(eq(announcements.id, announcementId), eq(projects.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

/** Adds a section at the end of the strip. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await assertOwned(params.id, user.orgId))) {
      return apiError("That announcement is not here.", 404);
    }

    const body = createSchema.parse(await request.json().catch(() => ({})));

    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${sections.position}), -1) + 1` })
      .from(sections)
      .where(eq(sections.announcementId, params.id));

    // A new section inherits the church's default voice so the person can
    // generate a voiceover without opening Settings first.
    const defaultVoice = await db.query.voices.findFirst({
      where: and(eq(voices.orgId, user.orgId), eq(voices.isDefault, true)),
    });

    const [section] = await db
      .insert(sections)
      .values({
        announcementId: params.id,
        position: next,
        text: body.text,
        voiceId: defaultVoice?.id ?? null,
      })
      .returning();

    return apiOk({ id: section.id }, 201);
  });
}

/**
 * Rewrites the whole ordering in one transaction. Positions are pushed out of
 * the way first because (announcement_id, position) is unique.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await assertOwned(params.id, user.orgId))) {
      return apiError("That announcement is not here.", 404);
    }

    const { order } = reorderSchema.parse(await request.json());

    const existing = await db.query.sections.findMany({
      where: eq(sections.announcementId, params.id),
      columns: { id: true },
    });
    const known = new Set(existing.map((s) => s.id));
    if (order.length !== known.size || !order.every((id) => known.has(id))) {
      return apiError("That reorder did not match the sections on screen. Reload and try again.", 409);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(sections)
        .set({ position: sql`${sections.position} + 1000` })
        .where(eq(sections.announcementId, params.id));

      for (const [index, id] of order.entries()) {
        await tx
          .update(sections)
          .set({ position: index, updatedAt: new Date() })
          .where(eq(sections.id, id));
      }
    });

    return apiOk(await loadAnnouncement(params.id, user.orgId));
  });
}
