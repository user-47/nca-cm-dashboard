import { env } from "./env";
import { sign } from "./hmac";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { JobType } from "@/db/schema";

/**
 * The app-to-n8n half of the contract. The app writes a job row first, then
 * fires a webhook that n8n acknowledges immediately. Everything after that
 * arrives as a signed callback to /api/jobs/:id/status.
 *
 * A failure to reach n8n is recorded on the job, not thrown at the person
 * mid-click: the builder shows a failed job with a readable reason and a
 * "Run again" button.
 */

/** Webhook path per job type. These must match the n8n workflow JSON in /n8n. */
const WEBHOOK_PATHS: Record<JobType, string> = {
  voiceover: "nca/voiceover",
  announcement_assembly: "nca/announcement-assembly",
  poster_render: "nca/poster-render",
  shorts_extract: "nca/shorts-extract",
  shorts_render: "nca/shorts-render",
  translation_chunk: "nca/translation-chunk",
};

export type TriggerResult = { ok: true } | { ok: false; error: string };

export async function triggerPipeline(
  jobId: string,
  type: JobType,
  payload: Record<string, unknown>
): Promise<TriggerResult> {
  const e = env();
  const body = JSON.stringify({
    jobId,
    type,
    payload,
    callbackUrl: `${e.APP_URL}/api/jobs/${jobId}/status`,
  });

  try {
    const res = await fetch(`${e.N8N_BASE_URL}/webhook/${WEBHOOK_PATHS[type]}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": sign(body),
      },
      body,
      // n8n acks immediately. If it has not answered in 15s something is wrong
      // with the instance, and waiting longer only blocks the person's click.
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      await res.text().catch(() => "");
      // A 404 means n8n is up but this workflow is not imported or not
      // switched on, which is the usual first-run mistake. Say that, rather
      // than passing n8n's own JSON through to a volunteer.
      const error =
        res.status === 404
          ? `The "${WEBHOOK_PATHS[type]}" pipeline is not active in n8n. Import the workflow and turn it on, then run this again.`
          : `The pipeline service answered ${res.status}. Check the n8n execution log.`;
      await failJob(jobId, error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (cause) {
    const error =
      cause instanceof Error && cause.name === "TimeoutError"
        ? "The pipeline service did not answer in time. Check that n8n is running."
        : "The pipeline service could not be reached. Check that n8n is running and N8N_BASE_URL is correct.";
    await failJob(jobId, error);
    return { ok: false, error };
  }
}

/**
 * Resumes a pipeline parked on an n8n Wait node, used by the Shorts review
 * gate. The resume URL is handed to the app by the pipeline itself when it
 * pauses, so the app never has to guess an execution id.
 */
export async function resumePipeline(
  resumeUrl: string,
  payload: Record<string, unknown>
): Promise<TriggerResult> {
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(resumeUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sign(body) },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, error: `The pipeline service answered ${res.status}.` };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "The pipeline service could not be reached. Check that n8n is running.",
    };
  }
}

async function failJob(jobId: string, error: string) {
  await db
    .update(jobs)
    .set({ status: "failed", errorText: error, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}
