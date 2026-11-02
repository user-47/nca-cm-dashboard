import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { FolderOpen } from "lucide-react";
import { db } from "@/db";
import { projects, announcements, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { NewAnnouncementButton } from "@/components/announcements/NewAnnouncementButton";
import { timeAgo } from "@/lib/utils";
import type { JobStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  announcement: "Announcement video",
  shorts: "Shorts",
  poster: "Poster",
  translation: "Translation",
};

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      kind: projects.kind,
      updatedAt: projects.updatedAt,
      announcementId: announcements.id,
      // The newest job on the project is what the card reports.
      jobStatus: sql<JobStatus | null>`(
        select j.status from jobs j
        where j.project_id = ${projects.id}
        order by j.created_at desc
        limit 1
      )`,
    })
    .from(projects)
    .leftJoin(announcements, eq(announcements.projectId, projects.id))
    .where(and(eq(projects.orgId, user.orgId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt))
    .limit(50);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl">Projects</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Everything this church has in progress.
          </p>
        </div>
        {rows.length > 0 ? <NewAnnouncementButton /> : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          body="Start with an announcement video. Posters, Shorts, and translation arrive in later releases."
          action={<NewAnnouncementButton />}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => {
            const href = row.announcementId
              ? `/announcements/${row.announcementId}`
              : "/projects";
            return (
              <li key={row.id}>
                <Link
                  href={href}
                  className="card flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-raised"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate font-medium">{row.name}</p>
                    {row.jobStatus ? <StatusPill status={row.jobStatus} /> : null}
                  </div>
                  <p className="mt-auto text-sm text-ink-muted">
                    {KIND_LABEL[row.kind] ?? row.kind} · edited {timeAgo(row.updatedAt)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
