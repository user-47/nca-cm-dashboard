import "server-only";
import { and, eq, desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { announcements, projects, sections, jobs, assets } from "@/db/schema";
import { presignGet } from "@/lib/s3";
import type { JobStatus } from "@/db/schema";

/**
 * One shape for the announcement builder, used by both the page render and
 * the poll endpoint so the client never has to reconcile two formats.
 */
/** An uploaded file as the builder needs it: something to show, and to play. */
export type AssetRef = {
  id: string;
  url: string;
  filename: string;
  /** Measured at upload for audio and video, null for stills. */
  durationMs: number | null;
};

export type SectionView = {
  id: string;
  position: number;
  text: string;
  audioSource: "recorded" | "tts";
  durationMs: number | null;
  /** Offset into the announcement's narration. Null on the per-section path. */
  startMs: number | null;
  voiceId: string | null;
  poster: AssetRef | null;
  audio: AssetRef | null;
};

export type AnnouncementView = {
  id: string;
  projectId: string;
  title: string;
  status: "draft" | "ready" | "rendering" | "complete" | "failed";
  sections: SectionView[];
  intro: AssetRef | null;
  outro: AssetRef | null;
  /**
   * One recording covering the whole announcement. Its presence is what puts the
   * builder in narration mode: sections then carry spans into this file instead
   * of audio of their own.
   */
  narration: AssetRef | null;
  rendered: AssetRef | null;
  job: {
    id: string;
    status: JobStatus;
    progress: number;
    stepLabel: string | null;
    errorText: string | null;
    updatedAt: string;
  } | null;
  /**
   * How long the finished video's body runs. In narration mode that is the
   * recording's own length; otherwise it is the sum of resolved section
   * durations, with nulls counting as zero.
   */
  totalMs: number;
  /** True when everything the render needs is present. Gates "Create video". */
  readyToRender: boolean;
};

async function assetView(id: string | null | undefined): Promise<AssetRef | null> {
  if (!id) return null;
  const row = await db.query.assets.findFirst({ where: eq(assets.id, id) });
  if (!row) return null;
  const meta = row.metaJson as { durationMs?: unknown };
  return {
    id: row.id,
    filename: row.filename,
    url: await presignGet(row.minioKey),
    durationMs: typeof meta?.durationMs === "number" ? meta.durationMs : null,
  };
}

export async function loadAnnouncement(
  id: string,
  orgId: string
): Promise<AnnouncementView | null> {
  const rows = await db
    .select({ a: announcements, p: projects })
    .from(announcements)
    .innerJoin(projects, eq(projects.id, announcements.projectId))
    .where(and(eq(announcements.id, id), eq(projects.orgId, orgId)))
    .limit(1);

  const found = rows[0];
  if (!found) return null;
  const a = found.a;

  const sectionRows = await db.query.sections.findMany({
    where: eq(sections.announcementId, a.id),
    orderBy: asc(sections.position),
  });

  const sectionViews: SectionView[] = await Promise.all(
    sectionRows.map(async (s) => ({
      id: s.id,
      position: s.position,
      text: s.text,
      audioSource: s.audioSource,
      durationMs: s.durationMs,
      startMs: s.startMs,
      voiceId: s.voiceId,
      poster: await assetView(s.posterAssetId),
      audio: await assetView(s.audioAssetId),
    }))
  );

  // The newest assembly job for this project is the one the builder shows.
  const jobRow = await db.query.jobs.findFirst({
    where: and(
      eq(jobs.projectId, a.projectId),
      eq(jobs.type, "announcement_assembly")
    ),
    orderBy: desc(jobs.createdAt),
  });

  const narration = await assetView(a.narrationAssetId);

  /**
   * The two paths need different things before a render can start.
   *
   * On the per-section path every section brings its own audio. In narration
   * mode one recording covers all of them, so what has to be there instead is a
   * resolved span per section — without one there is no length to hold the
   * poster for, which is the whole timing model.
   */
  const totalMs = narration
    ? narration.durationMs ??
      sectionViews.reduce((sum, s) => sum + (s.durationMs ?? 0), 0)
    : sectionViews.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);

  const readyToRender =
    sectionViews.length > 0 &&
    sectionViews.every((s) => s.poster !== null) &&
    (narration
      ? sectionViews.every((s) => s.durationMs !== null && s.startMs !== null)
      : sectionViews.every((s) => s.audio !== null));

  return {
    id: a.id,
    projectId: a.projectId,
    title: a.title,
    status: a.status,
    sections: sectionViews,
    intro: await assetView(a.introAssetId),
    outro: await assetView(a.outroAssetId),
    narration,
    rendered: await assetView(a.renderedAssetId),
    job: jobRow
      ? {
          id: jobRow.id,
          status: jobRow.status,
          progress: jobRow.progress,
          stepLabel: jobRow.stepLabel,
          errorText: jobRow.errorText,
          updatedAt: jobRow.updatedAt.toISOString(),
        }
      : null,
    totalMs,
    readyToRender,
  };
}

/** Confirms a section belongs to this org before any write touches it. */
export async function sectionOrgId(sectionId: string): Promise<string | null> {
  const rows = await db
    .select({ orgId: projects.orgId })
    .from(sections)
    .innerJoin(announcements, eq(announcements.id, sections.announcementId))
    .innerJoin(projects, eq(projects.id, announcements.projectId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  return rows[0]?.orgId ?? null;
}
