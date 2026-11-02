import { z } from "zod";
import { and, eq, isNull, asc } from "drizzle-orm";
import { db } from "@/db";
import { voices } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { apiError, apiOk, handle } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1, "Give the voice a name.").max(80),
  provider: z.enum(["kokoro", "fish"]),
  providerVoiceId: z.string().min(1, "Enter the voice id from the provider.").max(120),
  language: z.string().min(2).max(10).default("en"),
  isDefault: z.boolean().default(false),
  settingsJson: z.record(z.unknown()).default({}),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.query.voices.findMany({
      where: and(eq(voices.orgId, user.orgId), isNull(voices.deletedAt)),
      orderBy: asc(voices.name),
    });
    return apiOk(rows);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (user.role === "reviewer") {
      return apiError("Reviewers cannot change voices. Ask an admin.", 403);
    }

    const body = createSchema.parse(await request.json());

    const voice = await db.transaction(async (tx) => {
      // Exactly one default per church, or new sections inherit at random.
      if (body.isDefault) {
        await tx
          .update(voices)
          .set({ isDefault: false })
          .where(eq(voices.orgId, user.orgId));
      }
      const [row] = await tx
        .insert(voices)
        .values({ ...body, orgId: user.orgId })
        .returning();
      return row;
    });

    return apiOk(voice, 201);
  });
}
