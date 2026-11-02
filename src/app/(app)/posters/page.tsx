import Link from "next/link";
import { redirect } from "next/navigation";
import { Image as ImageIcon, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { listPosters } from "@/lib/posters";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Posters" };

export default async function PostersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const posters = await listPosters(user.orgId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl">Posters</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Fill in a layout and get an image you can post or drop into a video.
          </p>
        </div>
        {posters.length > 0 ? (
          <Link href="/posters/new">
            <Button variant="primary">
              <Plus className="h-4 w-4" strokeWidth={1.9} aria-hidden />
              New poster
            </Button>
          </Link>
        ) : null}
      </div>

      {posters.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No posters yet"
          body="Pick a size, a layout, and type what it should say. The poster is made in a couple of seconds."
          action={
            <Link href="/posters/new">
              <Button variant="primary">
                <Plus className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                New poster
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posters.map((poster) => (
            <li key={poster.id}>
              <Link
                href={`/posters/${poster.id}`}
                className="card flex h-full flex-col overflow-hidden transition-shadow hover:shadow-raised"
              >
                <span
                  className="flex items-center justify-center overflow-hidden"
                  style={{
                    aspectRatio: `${poster.width} / ${poster.height}`,
                    background: "rgba(27,36,48,0.05)",
                  }}
                >
                  {poster.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={poster.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon
                      className="h-5 w-5 text-ink-muted/60"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  )}
                </span>

                <span className="flex flex-col gap-0.5 p-3">
                  <span className="truncate font-medium">
                    {poster.name ?? "Untitled poster"}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {poster.brandName} ·{" "}
                    <span className="font-mono text-xs" data-numeric>
                      {poster.width} × {poster.height}
                    </span>
                  </span>
                  <span className="text-sm text-ink-muted">
                    edited {timeAgo(poster.updatedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
