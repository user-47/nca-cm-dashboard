import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { apiError, apiOk, handle } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const user = await requireUser();

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, params.id), eq(jobs.orgId, user.orgId)),
    });
    if (!job) return apiError("No job with that id.", 404);

    return apiOk({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      stepLabel: job.stepLabel,
      errorText: job.errorText,
      result: job.resultJson,
      updatedAt: job.updatedAt.toISOString(),
    });
  });
}
