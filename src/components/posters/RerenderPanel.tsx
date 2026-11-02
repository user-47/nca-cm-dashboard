"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Copy, Check } from "lucide-react";
import type { TemplateMeta } from "@nca/brand-tokens";
import { Button } from "@/components/ui/Button";
import { SlotForm } from "./SlotForm";
import { PosterPreview } from "./PosterPreview";

/** Editing an existing poster: change the values, draw it again. */
export function RerenderPanel({
  posterId,
  template,
  initialParams,
  brandId,
  width,
  height,
  initialRenderUrl,
  templatesUrl,
}: {
  posterId: string;
  template: TemplateMeta;
  initialParams: Record<string, string>;
  brandId: string;
  width: number;
  height: number;
  initialRenderUrl: string | null;
  templatesUrl: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initialParams);
  const [renderUrl, setRenderUrl] = useState(initialRenderUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const missing = template.slots
    .filter((s) => s.required && !values[s.id]?.trim())
    .map((s) => s.label);

  async function rerender() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posters/${posterId}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ params: values }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "The poster could not be made. Try again.");
        return;
      }
      setRenderUrl(body.url);
      router.refresh();
    } catch {
      setError("The server could not be reached. Check that it is running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="card flex flex-col gap-4 p-5">
        <h2 className="text-base">Content</h2>
        <SlotForm
          template={template}
          values={values}
          onChange={(id, value) =>
            setValues((prev) => ({ ...prev, [id]: value }))
          }
          templatesUrl={templatesUrl}
          disabled={busy}
        />
      </section>

      <aside className="flex flex-col gap-5">
        <div className="card flex flex-col gap-4 p-5">
          <PosterPreview
            templatesUrl={templatesUrl}
            brandId={brandId}
            templateId={template.id}
            templateVersion={template.version}
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

          {missing.length > 0 ? (
            <p className="text-sm text-ink-muted">Still needed: {missing.join(", ")}.</p>
          ) : null}

          <Button
            variant="primary"
            disabled={busy || missing.length > 0}
            onClick={() => void rerender()}
          >
            {busy ? "Making the poster" : "Make it again"}
          </Button>
        </div>

        {renderUrl ? (
          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-base">Latest</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={renderUrl}
              alt="The finished poster"
              className="w-full rounded border"
              style={{ borderColor: "var(--line)" }}
            />
            <div className="flex gap-2">
              <a
                href={renderUrl}
                download
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded border text-base font-medium transition-colors hover:bg-paper"
                style={{ borderColor: "var(--line-strong)" }}
              >
                <Download className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                Download
              </a>
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(renderUrl);
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
          </div>
        ) : null}
      </aside>
    </div>
  );
}
