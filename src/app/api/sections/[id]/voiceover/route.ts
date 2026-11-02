import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sections, announcements, voices, jobs } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { sectionOrgId } from "@/lib/announcements";
import { triggerPipeline } from "@/lib/n8n";
import { apiError, apiOk, handle } from "@/lib/api";

/**
 * Generates the voiceover for one section. The app writes the job row, hands
 * n8n the text and voice, and waits for the signed callback that carries the
 * audio key and its exact duration.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    if ((await sectionOrgId(params.id)) !== user.orgId) {
      return apiError("That section is not here.", 404);
    }

    const section = await db.query.sections.findFirst({
      where: eq(sections.id, params.id),
    });
    if (!section) return apiError("That section is not here.", 404);

    if (!section.text.trim()) {
      return apiError(
        "This section has no text yet. Write what the voice should say, then generate the voiceover.",
        422
      );
    }

    const voice = section.voiceId
      ? await db.query.voices.findFirst({
          where: and(eq(voices.id, section.voiceId), eq(voices.orgId, user.orgId)),
        })
      : await db.query.voices.findFirst({
          where: and(eq(voices.orgId, user.orgId), eq(voices.isDefault, true)),
        });

    if (!voice) {
      return apiError(
        "No voice is set up yet. Add one in Settings, then generate the voiceover.",
        422
      );
    }

    const announcement = await db.query.announcements.findFirst({
      where: eq(announcements.id, section.announcementId),
    });

    const [job] = await db
      .insert(jobs)
      .values({
        orgId: user.orgId,
        projectId: announcement?.projectId ?? null,
        type: "voiceover",
        status: "queued",
        stepLabel: "Generating voiceover",
        payloadJson: {
          sectionId: section.id,
          text: section.text,
          voice: {
            id: voice.id,
            provider: voice.provider,
            providerVoiceId: voice.providerVoiceId,
            language: voice.language,
            settings: voice.settingsJson,
          },
        },
      })
      .returning();

    // Mark the section as TTS-sourced now, so the strip shows the right
    // affordance even while the pipeline is still working.
    await db
      .update(sections)
      .set({ audioSource: "tts", voiceId: voice.id, updatedAt: new Date() })
      .where(eq(sections.id, section.id));

    const result = await triggerPipeline(job.id, "voiceover", {
      sectionId: section.id,
      text: section.text,
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
