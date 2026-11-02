import { and, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { announcements, projects, sections, assets, jobs } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { presignGetInternal, presignPutInternal } from "@/lib/s3";
import { triggerPipeline } from "@/lib/n8n";
import { apiError, apiOk, handle } from "@/lib/api";

/**
 * Hands the assembly pipeline everything it needs in one payload: ordered
 * section clips with their poster and audio, plus intro and outro, each as a
 * signed GET, and a signed PUT to write the finished video back to. n8n never
 * needs storage credentials of its own, and only URLs travel over the webhook,
 * never bytes.
 */

/**
 * How long every URL in one render payload stays valid.
 *
 * The default hour is not enough. Inputs are fetched early, but the output PUT
 * is used at the very end, so its clock has to cover the whole render. A long
 * announcement on modest church hardware can run well past an hour, and an
 * expired PUT would throw away work that had already finished.
 */
const RENDER_URL_TTL_SECONDS = 6 * 60 * 60;

/** Signed into the output PUT, so the pipeline must send this exact header. */
const OUTPUT_CONTENT_TYPE = "video/mp4";
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();

    const owned = await db
      .select({ a: announcements, projectId: projects.id })
      .from(announcements)
      .innerJoin(projects, eq(projects.id, announcements.projectId))
      .where(and(eq(announcements.id, params.id), eq(projects.orgId, user.orgId)))
      .limit(1);

    const found = owned[0];
    if (!found) return apiError("That announcement is not here.", 404);

    const rows = await db.query.sections.findMany({
      where: eq(sections.announcementId, params.id),
      orderBy: asc(sections.position),
    });

    if (rows.length === 0) {
      return apiError("Add at least one section before creating the video.", 422);
    }

    // One recording covering everything, or one file per section. Which of the
    // two is in play decides what each section has to bring.
    const narrationId = found.a.narrationAssetId;

    // Name the first blocking problem by section number, the way the person
    // sees them on the strip, rather than dumping a list of ids.
    for (const [index, s] of rows.entries()) {
      const n = index + 1;
      if (!s.posterAssetId) {
        return apiError(`Section ${n} has no poster yet. Attach one, then create the video.`, 422);
      }
      if (narrationId) {
        if (s.startMs == null || s.durationMs == null) {
          return apiError(
            `Section ${n} has no place in the narration yet. Set its boundaries on the strip, then create the video.`,
            422
          );
        }
      } else if (!s.audioAssetId) {
        return apiError(
          `Section ${n} has no audio yet. Record or upload audio, or generate a voiceover, then create the video.`,
          422
        );
      }
    }

    const keyed = await keysFor([
      ...rows.map((s) => s.posterAssetId!),
      ...rows.map((s) => s.audioAssetId),
      found.a.introAssetId,
      found.a.outroAssetId,
      narrationId,
    ]);

    const withUrl = async (assetId: string | null) => {
      const entry = assetId ? keyed.get(assetId) : undefined;
      if (!entry) return null;
      return {
        ...entry,
        url: await presignGetInternal(entry.key, RENDER_URL_TTL_SECONDS),
      };
    };

    // Written into the bucket by the pipeline, then confirmed on callback.
    const outputKey = `${user.orgId}/video/announcement-${found.a.id}.mp4`;

    const payload = {
      announcementId: found.a.id,
      title: found.a.title,
      intro: await withUrl(found.a.introAssetId),
      outro: await withUrl(found.a.outroAssetId),
      /**
       * Present only when one recording covers the whole announcement. The
       * assembler switches on it, and it is what tells the pipeline to take each
       * section's length from the plan instead of probing audio that is not
       * there.
       */
      narration: await withUrl(narrationId),
      sections: await Promise.all(
        rows.map(async (s, index) => {
          const poster = keyed.get(s.posterAssetId!)!;
          return {
            index,
            sectionId: s.id,
            startMs: s.startMs,
            durationMs: s.durationMs,
            poster: {
              ...poster,
              url: await presignGetInternal(poster.key, RENDER_URL_TTL_SECONDS),
            },
            // Null in narration mode: the section's span of the recording is its
            // audio, and it is carried by startMs and durationMs instead.
            audio: await withUrl(s.audioAssetId),
          };
        })
      ),
      output: {
        key: outputKey,
        contentType: OUTPUT_CONTENT_TYPE,
        putUrl: await presignPutInternal(
          outputKey,
          OUTPUT_CONTENT_TYPE,
          RENDER_URL_TTL_SECONDS
        ),
      },
    };

    const [job] = await db
      .insert(jobs)
      .values({
        orgId: user.orgId,
        projectId: found.projectId,
        type: "announcement_assembly",
        status: "queued",
        stepLabel: "Queued",
        payloadJson: { announcementId: found.a.id, sectionCount: rows.length },
      })
      .returning();

    await db
      .update(announcements)
      .set({ status: "rendering", updatedAt: new Date() })
      .where(eq(announcements.id, params.id));

    const result = await triggerPipeline(job.id, "announcement_assembly", payload);
    if (!result.ok) {
      await db
        .update(announcements)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(announcements.id, params.id));
      return apiError(result.error, 502);
    }

    return apiOk({ jobId: job.id }, 202);
  });
}

async function keysFor(ids: Array<string | null>) {
  const wanted = ids.filter((id): id is string => Boolean(id));
  const map = new Map<string, { assetId: string; key: string; filename: string }>();
  if (wanted.length === 0) return map;

  const rows = await db.query.assets.findMany({
    where: (a, { inArray }) => inArray(a.id, wanted),
  });
  for (const row of rows) {
    map.set(row.id, {
      assetId: row.id,
      key: row.minioKey,
      filename: row.filename,
    });
  }
  return map;
}
