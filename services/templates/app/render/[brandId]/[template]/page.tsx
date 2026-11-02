import { notFound } from "next/navigation";
import {
  brandCssBlock,
  brandFontFaces,
  isImageSlot,
  paramsSchemaFor,
} from "@nca/brand-tokens";
import { loadBrand } from "../../../../lib/brand";
import { lookupTemplate } from "../../../../templates/registry";

/**
 * The render surface.
 *
 * One URL produces one poster. Playwright points a headless browser here and
 * screenshots the result, and the dashboard points an iframe at the same URL
 * for the live preview, so what a person sees while typing is the same code
 * path that produces the final PNG.
 *
 * Always dynamic: the brand comes from the database and the params come from
 * the query string, so there is nothing to cache and a stale frame would be a
 * wrong poster.
 */
export const dynamic = "force-dynamic";

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1350;

/** Guards against a query string asking for a 40000px canvas. */
function dimension(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(4096, Math.max(200, Math.round(n)));
}

export default async function RenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; template: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { brandId, template: templateId } = await params;
  const query = await searchParams;

  // Repeated query keys arrive as arrays; a poster slot only ever takes one.
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }

  const version = flat.v ?? "v1";
  const width = dimension(flat.w, DEFAULT_WIDTH);
  const height = dimension(flat.h, DEFAULT_HEIGHT);

  const registered = lookupTemplate(templateId, version);
  if (!registered) notFound();

  const brand = await loadBrand(brandId);
  if (!brand) notFound();

  /**
   * Params are validated against the template's own slots, but leniently: the
   * preview iframe fires on every keystroke, and a half-typed quote should
   * draw an incomplete poster rather than an error page. render-api validates
   * strictly before it commits a render.
   */
  const parsed = paramsSchemaFor(registered.meta).partial().safeParse(flat);
  const values: Record<string, string | undefined> = parsed.success
    ? (parsed.data as Record<string, string | undefined>)
    : flat;

  /**
   * Image and cutout slots carry an object key rather than a URL. Point them at
   * this app's own image route, as a relative path so the same markup works
   * whether it is the person's browser loading the preview or headless Chromium
   * taking the screenshot.
   *
   * Which types those are comes from `isImageSlot` rather than being spelled
   * out here, so a new key-carrying slot type cannot reach the markup unrewritten.
   */
  for (const slot of registered.meta.slots) {
    if (!isImageSlot(slot.type)) continue;
    const value = values[slot.id];
    if (value && !/^https?:\/\//.test(value)) {
      values[slot.id] = `/api/image/${value.split("/").map(encodeURIComponent).join("/")}`;
    }
  }

  const { Component } = registered;

  return (
    <>
      {/*
        Injected per request rather than built into a stylesheet, because the
        values are brand data. Only the faces this brand uses are declared, so
        the page never downloads a family it will not draw.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `${brandFontFaces(brand.tokens)}\n\n${brandCssBlock(brand.tokens)}`,
        }}
      />
      <main
        // render-api waits for this to exist before it screenshots, so the
        // frame is never captured mid-paint.
        data-poster-root=""
        data-brand={brand.slug}
        data-template={`${registered.meta.id}@${registered.meta.version}`}
        style={{ width, height }}
      >
        <Component
          params={values}
          tokens={brand.tokens}
          brand={{ name: brand.name, slug: brand.slug, logoUrl: brand.logoUrl }}
          width={width}
          height={height}
        />
      </main>
    </>
  );
}
