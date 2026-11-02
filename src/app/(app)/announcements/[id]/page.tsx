import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, isNull, asc } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { voices } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { loadAnnouncement } from "@/lib/announcements";
import { Builder } from "@/components/announcements/Builder";
import { TitleField } from "@/components/announcements/TitleField";

export default async function AnnouncementPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const view = await loadAnnouncement(params.id, user.orgId);
  if (!view) notFound();

  const voiceRows = await db.query.voices.findMany({
    where: and(eq(voices.orgId, user.orgId), isNull(voices.deletedAt)),
    orderBy: asc(voices.name),
    columns: { id: true, name: true, language: true },
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/announcements"
          className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          Announcements
        </Link>
        <TitleField id={view.id} title={view.title} />
      </div>

      <Builder initial={view} voices={voiceRows} />
    </div>
  );
}
