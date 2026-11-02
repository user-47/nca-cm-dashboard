import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { listBrands, listTemplates, loadPoster } from "@/lib/posters";
import { RerenderPanel } from "@/components/posters/RerenderPanel";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function PosterPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const poster = await loadPoster(params.id, user.orgId);
  if (!poster) notFound();

  const [brands, templates] = await Promise.all([
    listBrands(user.orgId),
    listTemplates(),
  ]);

  const template = templates.find(
    (t) => t.id === poster.templateId && t.version === poster.templateVersion
  );
  const brand = brands.find((b) => b.id === poster.brandId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/posters"
          className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          Posters
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl">{poster.name ?? "Untitled poster"}</h1>
          <p className="text-sm text-ink-muted">
            {brand?.name ?? "Unknown brand"} · {template?.name ?? poster.templateId} ·{" "}
            <span className="font-mono text-xs" data-numeric>
              {poster.width} × {poster.height}
            </span>
          </p>
        </div>
      </div>

      {template ? (
        <RerenderPanel
          posterId={poster.id}
          template={template}
          initialParams={poster.params}
          brandId={poster.brandId}
          width={poster.width}
          height={poster.height}
          initialRenderUrl={poster.latestRenderUrl}
          templatesUrl={env().NEXT_PUBLIC_TEMPLATES_URL}
        />
      ) : (
        <div className="card p-5">
          <p className="text-sm text-ink-muted">
            This poster was made with layout{" "}
            <span className="font-mono">
              {poster.templateId}@{poster.templateVersion}
            </span>
            , which is no longer registered. The finished image is still here.
          </p>
          {poster.latestRenderUrl ? (
            <a
              href={poster.latestRenderUrl}
              download
              className="mt-4 inline-flex h-10 items-center gap-2 rounded border px-4 text-base font-medium transition-colors hover:bg-paper"
              style={{ borderColor: "var(--line-strong)" }}
            >
              <Download className="h-4 w-4" strokeWidth={1.9} aria-hidden />
              Download
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
