import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, and, desc, isNull } from "drizzle-orm";
import { Megaphone } from "lucide-react";
import { db } from "@/db";
import { announcements, projects, sections } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewAnnouncementButton } from "@/components/announcements/NewAnnouncementButton";
import { formatDuration, timeAgo } from "@/lib/utils";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  rendering: "Rendering",
  complete: "Done",
  failed: "Stopped",
};

export default async function AnnouncementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      status: announcements.status,
      updatedAt: announcements.updatedAt,
      sectionCount: sql<number>`count(${sections.id})::int`,
      totalMs: sql<number>`coalesce(sum(${sections.durationMs}), 0)::int`,
    })
    .from(announcements)
    .innerJoin(projects, eq(projects.id, announcements.projectId))
    .leftJoin(sections, eq(sections.announcementId, announcements.id))
    .where(and(eq(projects.orgId, user.orgId), isNull(projects.deletedAt)))
    .groupBy(announcements.id)
    .orderBy(desc(announcements.updatedAt));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl">Announcements</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Posters and narration, assembled into one video.
          </p>
        </div>
        <NewAnnouncementButton />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          body="An announcement is a run of posters, each on screen for as long as its narration. Make the first one."
          action={<NewAnnouncementButton />}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/announcements/${row.id}`}
                className="card flex items-center justify-between gap-4 px-4 py-3.5 transition-shadow hover:shadow-raised"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.title}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {row.sectionCount}{" "}
                    {row.sectionCount === 1 ? "section" : "sections"}
                    {row.totalMs > 0 ? (
                      <>
                        {" · "}
                        <span className="font-mono" data-numeric>
                          {formatDuration(row.totalMs)}
                        </span>
                      </>
                    ) : null}
                    {" · edited "}
                    {timeAgo(row.updatedAt)}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-ink-muted">
                  {STATUS_TEXT[row.status] ?? row.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
