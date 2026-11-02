"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Copy, Check, Image as ImageIcon } from "lucide-react";
import { RATIO_PRESETS, ratioFor, type TemplateMeta } from "@nca/brand-tokens";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import { SlotForm } from "./SlotForm";
import { PosterPreview } from "./PosterPreview";
import type { BrandOption } from "@/lib/posters";

/**
 * Size presets, named the way a person thinks about them: where the poster is
 * going, not what its aspect ratio is called.
 */
const PRESETS = [
  { id: "ig-square", label: "Instagram square", ...RATIO_PRESETS["1:1"] },
  { id: "ig-portrait", label: "Instagram portrait", ...RATIO_PRESETS["4:5"] },
  { id: "ig-story", label: "Instagram story", ...RATIO_PRESETS["9:16"] },
  { id: "fb-post", label: "Facebook post", width: 1200, height: 630 },
  { id: "yt-thumb", label: "YouTube thumbnail", ...RATIO_PRESETS["16:9"] },
] as const;

type RenderResult = {
  posterId: string;
  url: string;
  bytes: number;
  renderMs: number;
};

export function PosterWizard({
  brands,
  templates,
  templatesUrl,
}: {
  brands: BrandOption[];
  templates: TemplateMeta[];
  templatesUrl: string;
}) {
  const router = useRouter();

  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1350);
  const [brandId, setBrandId] = useState(brands.find((b) => b.isDefault)?.id ?? brands[0]?.id ?? "");
  const [templateKey, setTemplateKey] = useState("");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [copied, setCopied] = useState(false);

  const ratio = ratioFor(width, height);

  /**
   * Only templates that say they handle this shape. Offering one that does not
   * would produce a poster with clipped or stranded type, and the person would
   * have no way to know why.
   */
  const usable = useMemo(
    () =>
      templates.filter(
        (t) => t.supportedRatios.includes(ratio) || t.supportedRatios.includes("custom")
      ),
    [templates, ratio]
  );

  const template = usable.find((t) => `${t.id}@${t.version}` === templateKey) ?? null;

  function pickPreset(w: number, h: number) {
    setWidth(w);
    setHeight(h);
  }

  function setValue(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
    // The picture on screen no longer matches the saved render.
    setResult(null);
  }

  async function createAndRender() {
    if (!template || !brandId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/posters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId,
          templateId: template.id,
          templateVersion: template.version,
          name: name.trim() || null,
          params: values,
          width,
          height,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "The poster could not be made. Try again.");
        return;
      }
      setResult(body as RenderResult);
      router.refresh();
    } catch {
      setError("The server could not be reached. Check that it is running.");
    } finally {
      setBusy(false);
    }
  }

  const missing = template
    ? template.slots.filter((s) => s.required && !values[s.id]?.trim()).map((s) => s.label)
    : [];
  const canRender = Boolean(template && brandId && missing.length === 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* ---------------------------------------------------- 1. size */}
        <section className="card flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-base">Size</h2>
            <p className="mt-1 text-sm text-ink-muted">Where is this poster going?</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = p.width === width && p.height === height;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPreset(p.width, p.height)}
                  aria-pressed={active}
                  className={cn(
                    "rounded border px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-brass bg-[color-mix(in_srgb,var(--brass)_10%,transparent)] text-ink"
                      : "border-[var(--line-strong)] text-ink-muted hover:border-ink-muted hover:text-ink"
                  )}
                >
                  <span className="block font-medium">{p.label}</span>
                  <span className="block font-mono text-xs" data-numeric>
                    {p.width} × {p.height}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Width" htmlFor="w" className="w-28">
              <Input
                id="w"
                type="number"
                min={200}
                max={4096}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Height" htmlFor="h" className="w-28">
              <Input
                id="h"
                type="number"
                min={200}
                max={4096}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value) || 0)}
              />
            </Field>
            <p className="pb-2 text-sm text-ink-muted">
              {ratio === "custom" ? "Custom size" : `${ratio} ratio`}
            </p>
          </div>
        </section>

        {/* ----------------------------------------- 2. brand + template */}
        <section className="card flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-base">Brand and layout</h2>
            <p className="mt-1 text-sm text-ink-muted">
              The brand sets the colours and type. The layout sets the arrangement.
            </p>
          </div>

          <Field label="Brand" htmlFor="brand">
            <Select id="brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.isDefault ? " (default)" : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="label">Layout</span>
            {usable.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No layout handles {width} × {height} yet. Pick another size.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {usable.map((t) => {
                  const key = `${t.id}@${t.version}`;
                  const active = key === templateKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setTemplateKey(key);
                        setValues({});
                        setResult(null);
                      }}
                      aria-pressed={active}
                      className={cn(
                        "rounded border p-3 text-left transition-colors",
                        active
                          ? "border-brass shadow-card"
                          : "border-[var(--line-strong)] hover:border-ink-muted"
                      )}
                    >
                      <span className="block font-medium">{t.name}</span>
                      {t.description ? (
                        <span className="mt-0.5 block text-sm text-ink-muted">
                          {t.description}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* -------------------------------------------------- 3. content */}
        <section className="card flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-base">Content</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {template
                ? "What this poster says."
                : "Pick a layout and its fields appear here."}
            </p>
          </div>

          {template ? (
            <>
              <Field
                label="Name (optional)"
                htmlFor="poster-name"
                hint="Only for finding it again later. It does not appear on the poster."
              >
                <Input
                  id="poster-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Barbecue announcement"
                />
              </Field>

              <SlotForm
                template={template}
                values={values}
                onChange={setValue}
                templatesUrl={templatesUrl}
                disabled={busy}
              />
            </>
          ) : null}
        </section>
      </div>

      {/* ------------------------------------------------------- side rail */}
      <aside className="flex flex-col gap-5">
        <div className="card flex flex-col gap-4 p-5">
          <PosterPreview
            templatesUrl={templatesUrl}
            brandId={brandId || null}
            templateId={template?.id ?? null}
            templateVersion={template?.version ?? "v1"}
            params={values}
            width={width}
            height={height}
          />

          {error ? (
            <p
              role="alert"
              className="rounded px-3 py-2 text-sm text-[var(--error)]"
              style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)" }}
            >
              {error}
            </p>
          ) : null}

          {missing.length > 0 && template ? (
            <p className="text-sm text-ink-muted">
              Still needed: {missing.join(", ")}.
            </p>
          ) : null}

          <Button
            variant="primary"
            disabled={!canRender || busy}
            onClick={() => void createAndRender()}
          >
            {busy ? "Making the poster" : result ? "Make it again" : "Make poster"}
          </Button>
        </div>

        {result ? (
          <div className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base">Finished</h2>
              <span className="font-mono text-xs text-ink-muted" data-numeric>
                {(result.bytes / 1024).toFixed(0)} KB · {result.renderMs} ms
              </span>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.url}
              alt="The finished poster"
              className="w-full rounded border"
              style={{ borderColor: "var(--line)" }}
            />

            <div className="flex gap-2">
              <a
                href={result.url}
                download
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded border text-base font-medium transition-colors hover:bg-paper"
                style={{ borderColor: "var(--line-strong)" }}
              >
                <Download className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                Download
              </a>
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(result.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                aria-label="Copy the poster link"
              >
                {copied ? (
                  <Check className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                )}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>

            <p className="text-sm text-ink-muted">
              This poster is now in your files, so you can use it as a section
              poster in an announcement video.
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
