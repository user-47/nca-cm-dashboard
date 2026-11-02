import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { voices, jobs } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { triggerPipeline } from "@/lib/n8n";
import { apiError, apiOk, handle } from "@/lib/api";

const schema = z.object({
  text: z
    .string()
    .max(600)
    .default("Good morning, and welcome to New Covenant Assembly."),
});

/**
 * Speaks a short line so the person can hear a voice before they use it on a
 * whole announcement. Runs through the same voiceover sub-workflow, with no
 * section attached, so what they hear is what they will get.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();

    const voice = await db.query.voices.findFirst({
      where: and(
        eq(voices.id, params.id),
        eq(voices.orgId, user.orgId),
        isNull(voices.deletedAt)
      ),
    });
    if (!voice) return apiError("That voice is not here.", 404);

    const { text } = schema.parse(await request.json().catch(() => ({})));

    const [job] = await db
      .insert(jobs)
      .values({
        orgId: user.orgId,
        type: "voiceover",
        status: "queued",
        stepLabel: "Testing voice",
        payloadJson: { voiceId: voice.id, text },
      })
      .returning();

    const result = await triggerPipeline(job.id, "voiceover", {
      voiceId: voice.id,
      text,
      voice: {
        provider: voice.provider,
        voiceId: voice.providerVoiceId,
        language: voice.language,
        settings: voice.settingsJson,
      },
    });

    if (!result.ok) return apiError(result.error, 502);
    return apiOk({ jobId: job.id }, 202);
  });
}
