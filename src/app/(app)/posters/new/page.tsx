import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { listBrands, listTemplates } from "@/lib/posters";
import { env } from "@/lib/env";
import { PosterWizard } from "@/components/posters/PosterWizard";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const metadata = { title: "New poster" };

export default async function NewPosterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [brands, templates] = await Promise.all([
    listBrands(user.orgId),
    listTemplates(),
  ]);

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
        <h1 className="text-xl">New poster</h1>
      </div>

      {brands.length === 0 ? (
        <EmptyState
          title="No brands yet"
          body="A poster needs a brand for its colours and type. Seed one with `npm run db:seed-brands`, or add one from Brands."
        />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No layouts registered"
          body="Run `npm run db:seed-brands` to register the layouts that ship with this app."
        />
      ) : (
        <PosterWizard
          brands={brands}
          templates={templates}
          templatesUrl={env().NEXT_PUBLIC_TEMPLATES_URL}
        />
      )}
    </div>
  );
}
