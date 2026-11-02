"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/utils";

/**
 * The live preview.
 *
 * An iframe pointed at the templates app, which is the same URL render-api
 * screenshots. That is the point: what a person watches while typing is drawn
 * by the code that will draw the final PNG, so the preview cannot drift from
 * the result.
 *
 * The frame renders at true poster size and is scaled down with a transform,
 * rather than being given a small viewport. Scaling the viewport would change
 * layout, and the preview would stop predicting the render.
 */
export function PosterPreview({
  templatesUrl,
  brandId,
  templateId,
  templateVersion,
  params,
  width,
  height,
  debounceMs = 250,
}: {
  templatesUrl: string;
  brandId: string | null;
  templateId: string | null;
  templateVersion: string;
  params: Record<string, string>;
  width: number;
  height: number;
  debounceMs?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(320);

  // Keep the scale honest as the rail resizes.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setBoxWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Debounced so a keystroke does not start a page load. Every change resets
   * the timer, so the frame reloads once the person pauses rather than once
   * per character.
   */
  useEffect(() => {
    if (!brandId || !templateId) {
      setSrc(null);
      return;
    }

    const timer = setTimeout(() => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value);
      }
      query.set("v", templateVersion);
      query.set("w", String(width));
      query.set("h", String(height));
      setSrc(`${templatesUrl}/render/${brandId}/${templateId}?${query.toString()}`);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [templatesUrl, brandId, templateId, templateVersion, params, width, height, debounceMs]);

  const scale = boxWidth / width;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label">Preview</span>
        <span className="font-mono text-xs text-ink-muted" data-numeric>
          {width} × {height}
        </span>
      </div>

      <div
        ref={boxRef}
        className="w-full overflow-hidden rounded border"
        style={{
          borderColor: "var(--line-strong)",
          // Reserve the exact scaled height so the panel does not jump when the
          // frame loads or the ratio changes.
          height: Math.round(height * scale),
          background: "rgba(27,36,48,0.04)",
        }}
      >
        {src ? (
          <iframe
            key={src}
            src={src}
            title="Poster preview"
            // Nothing in a template is interactive; this is a picture.
            sandbox="allow-same-origin"
            scrolling="no"
            style={{
              width,
              height,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-ink-muted">
            {brandId
              ? "Pick a layout to see the poster here."
              : "Pick a brand and a layout to see the poster here."}
          </div>
        )}
      </div>
    </div>
  );
}
