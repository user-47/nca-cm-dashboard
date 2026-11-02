import { z } from "zod";
import { db } from "@/db";
import { announcements, projects } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { apiOk, handle } from "@/lib/api";

const schema = z.object({
  title: z.string().min(1, "Give the announcement a title.").max(160),
});

/**
 * An announcement always sits inside a project, so creating one creates both.
 * The person only ever names the announcement.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { title } = schema.parse(await request.json());

    const created = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ orgId: user.orgId, name: title, kind: "announcement" })
        .returning();

      const [announcement] = await tx
        .insert(announcements)
        .values({ projectId: project.id, title })
        .returning();

      return announcement;
    });

    return apiOk({ id: created.id }, 201);
  });
}
