import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { voices } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { apiError, apiOk, handle } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  provider: z.enum(["kokoro", "fish"]).optional(),
  providerVoiceId: z.string().min(1).max(120).optional(),
  language: z.string().min(2).max(10).optional(),
  isDefault: z.boolean().optional(),
  settingsJson: z.record(z.unknown()).optional(),
});

async function owned(id: string, orgId: string) {
  return db.query.voices.findFirst({
    where: and(eq(voices.id, id), eq(voices.orgId, orgId), isNull(voices.deletedAt)),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    if (user.role === "reviewer") {
      return apiError("Reviewers cannot change voices. Ask an admin.", 403);
    }
    if (!(await owned(params.id, user.orgId))) {
      return apiError("That voice is not here.", 404);
    }

    const patch = patchSchema.parse(await request.json());

    const row = await db.transaction(async (tx) => {
      if (patch.isDefault) {
        await tx
          .update(voices)
          .set({ isDefault: false })
          .where(eq(voices.orgId, user.orgId));
      }
      const [updated] = await tx
        .update(voices)
        .set(patch)
        .where(eq(voices.id, params.id))
        .returning();
      return updated;
    });

    return apiOk(row);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();
    if (user.role === "reviewer") {
      return apiError("Reviewers cannot change voices. Ask an admin.", 403);
    }
    if (!(await owned(params.id, user.orgId))) {
      return apiError("That voice is not here.", 404);
    }

    // Soft delete: sections already rendered with this voice keep their record
    // of which voice spoke them.
    await db
      .update(voices)
      .set({ deletedAt: new Date(), isDefault: false })
      .where(eq(voices.id, params.id));

    return apiOk({ ok: true });
  });
}
