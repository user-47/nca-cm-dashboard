import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, sections, announcements, assets, voices } from "@/db/schema";
import { readSignedJson } from "@/lib/hmac";
import { headObject } from "@/lib/s3";
import { apiError, apiOk, handle } from "@/lib/api";

/**
 * The n8n-to-app half of the contract. Pipelines report here and nowhere else,
 * and this app's database stays the single source of truth for status.
 *
 * Unsigned or wrongly signed bodies are rejected, so knowing a job id is not
 * enough to fake a "complete".
 */

const artifactSchema = z.object({
  key: z.string().min(1),
  filename: z.string().min(1).max(200).optional(),
  contentType: z.string().min(1).max(120).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const bodySchema = z.object({
  status: z.enum([
    "queued",
    "running",
    "awaiting_review",
    "rendering",
    "complete",
    "failed",
  ]),
  progress: z.number().int().min(0).max(100).optional(),
  stepLabel: z.string().max(200).optional(),
  error: z.string().max(2000).optional(),
  // Set when a pipeline parks on a Wait node, so the app can resume it later.
  resumeUrl: z.string().url().optional(),
  // The artifact this step produced, if any.
  artifact: artifactSchema.optional(),
  // Which section a voiceover belongs to. Echoed back from the trigger payload.
  sectionId: z.string().uuid().optional(),
  // Which voice a test sample belongs to.
  voiceId: z.string().uuid().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const signed = await readSignedJson(request);
    if (!signed.ok) {
      return apiError("That callback was not signed correctly.", 401);
    }

    const body = bodySchema.parse(signed.data);

    const job = await db.query.jobs.findFirst({ where: eq(jobs.id, params.id) });
    if (!job) return apiError("No job with that id.", 404);

    // A finished job is final. A late duplicate callback must not resurrect it
    // or overwrite a result the person is already looking at.
    if (job.status === "complete" || job.status === "failed") {
      return apiOk({ ok: true, ignored: "This job already finished." });
    }

    // Register the artifact first, so the row it attaches to is never pointed
    // at an asset that does not exist yet.
    let assetId: string | null = null;
    if (body.artifact) {
      assetId = await registerArtifact(job.orgId, body.artifact);
      if (!assetId) {
        await db
          .update(jobs)
          .set({
            status: "failed",
            errorText: `The pipeline reported a file at ${body.artifact.key}, but nothing is there.`,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, job.id));
        return apiError("That artifact is not in storage.", 409);
      }
    }

    await db
      .update(jobs)
      .set({
        status: body.status,
        progress: body.progress ?? (body.status === "complete" ? 100 : job.progress),
        stepLabel: body.stepLabel ?? job.stepLabel,
        errorText: body.error ?? null,
        resumeUrl: body.resumeUrl ?? job.resumeUrl,
        resultJson: assetId
          ? { ...job.resultJson, assetId, key: body.artifact!.key }
          : job.resultJson,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));

    await applyToDomain(job.type, job.payloadJson, body, assetId);

    return apiOk({ ok: true });
  });
}

/** Creates the assets row for a file a pipeline just wrote, once it verifies. */
async function registerArtifact(
  orgId: string,
  artifact: z.infer<typeof artifactSchema>
): Promise<string | null> {
  const existing = await db.query.assets.findFirst({
    where: eq(assets.minioKey, artifact.key),
  });
  if (existing) return existing.id;

  const head = await headObject(artifact.key);
  if (!head.exists) return null;

  const meta: Record<string, unknown> = {};
  if (artifact.durationMs != null) meta.durationMs = artifact.durationMs;
  if (artifact.width) meta.width = artifact.width;
  if (artifact.height) meta.height = artifact.height;

  const filename = artifact.filename ?? artifact.key.split("/").pop() ?? "file";
  const [row] = await db
    .insert(assets)
    .values({
      orgId,
      kind: kindFor(artifact.contentType, filename),
      minioKey: artifact.key,
      filename,
      contentType: artifact.contentType ?? "application/octet-stream",
      sizeBytes: head.size,
      metaJson: meta,
    })
    .returning();

  return row.id;
}

function kindFor(contentType: string | undefined, filename: string) {
  const probe = contentType ?? filename;
  if (/audio|\.(mp3|wav|m4a|ogg|flac)$/i.test(probe)) return "audio" as const;
  if (/video|\.(mp4|mov|mkv|webm)$/i.test(probe)) return "video" as const;
  return "image" as const;
}

/**
 * Writes the pipeline result back onto whatever the person is actually
 * looking at: a section's audio, or the finished announcement video.
 */
async function applyToDomain(
  type: string,
  payload: Record<string, unknown>,
  body: z.infer<typeof bodySchema>,
  assetId: string | null
) {
  const now = new Date();

  if (type === "voiceover") {
    const sectionId = body.sectionId ?? (payload.sectionId as string | undefined);
    // A voiceover job with no section is a Settings voice test. The sample
    // hangs off the voice so the person can replay it.
    if (!sectionId) {
      const voiceId = body.voiceId ?? (payload.voiceId as string | undefined);
      if (voiceId && assetId) {
        await db
          .update(voices)
          .set({ sampleAssetId: assetId })
          .where(eq(voices.id, voiceId));
      }
      return;
    }

    if (body.status === "complete" && assetId) {
      await db
        .update(sections)
        .set({
          audioAssetId: assetId,
          audioSource: "tts",
          durationMs: body.artifact?.durationMs ?? null,
          updatedAt: now,
        })
        .where(eq(sections.id, sectionId));
    }
    return;
  }

  if (type === "announcement_assembly") {
    const announcementId = payload.announcementId as string | undefined;
    if (!announcementId) return;

    if (body.status === "complete" && assetId) {
      await db
        .update(announcements)
        .set({ status: "complete", renderedAssetId: assetId, updatedAt: now })
        .where(eq(announcements.id, announcementId));
    } else if (body.status === "failed") {
      await db
        .update(announcements)
        .set({ status: "failed", updatedAt: now })
        .where(eq(announcements.id, announcementId));
    } else {
      await db
        .update(announcements)
        .set({ status: "rendering", updatedAt: now })
        .where(eq(announcements.id, announcementId));
    }
  }
}
