import { redirect } from "next/navigation";
import { Palette } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { listBrands } from "@/lib/posters";
import { EmptyState } from "@/components/ui/EmptyState";
import { FONT_REGISTRY } from "@nca/brand-tokens";
import { ExtractReference } from "@/components/brands/ExtractReference";
import { BrandLogo } from "@/components/brands/BrandLogo";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brands" };

/**
 * Brands are created two ways: by seeding, or by reading one out of a poster
 * someone uploaded. Editing an existing brand in place is Phase 2 — for now,
 * read a new one and delete the old.
 */
export default async function BrandsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const brands = await listBrands(user.orgId);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl">Brands</h1>
          <p className="mt-1 text-sm text-ink-muted">
            The colours and type your posters are drawn with.
          </p>
        </div>
        {user.role === "reviewer" ? null : <ExtractReference />}
      </div>

      {brands.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No brands yet"
          body="Upload a poster you like the look of and its colours and type become a brand. Or run `npm run db:seed-brands` for the one this church ships with."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {brands.map((brand) => {
            const { colors, fonts, mood } = brand.tokens;
            return (
              <li key={brand.id} className="card flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {brand.name}
                      {brand.isDefault ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            background:
                              "color-mix(in srgb, var(--forest) 14%, transparent)",
                            color: "var(--forest)",
                          }}
                        >
                          Default
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">{mood}</p>
                  </div>
                  <span className="font-mono text-xs text-ink-muted">{brand.slug}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["Primary", colors.primary],
                      ["Accent", colors.accent],
                      ["Surface", colors.surface],
                      ["Ink", colors.ink],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-8 w-8 rounded border"
                        style={{ background: value, borderColor: "var(--line-strong)" }}
                      />
                      <span className="text-sm">
                        <span className="block text-ink-muted">{label}</span>
                        <span className="block font-mono text-xs">{value}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-ink-muted">
                  {FONT_REGISTRY[fonts.display].family} for headings,{" "}
                  {FONT_REGISTRY[fonts.body].family} for body text.
                </p>

                <BrandLogo
                  brandId={brand.id}
                  current={brand.logo}
                  templatesUrl={env().NEXT_PUBLIC_TEMPLATES_URL}
                  disabled={user.role === "reviewer"}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
