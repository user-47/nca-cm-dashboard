"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileDrop } from "@/components/ui/FileDrop";

/**
 * The church's mark, attached to one brand.
 *
 * Posters fall back to the brand name set as a wordmark when there is no logo,
 * so this is genuinely optional — a brand without one still looks deliberate.
 */
export function BrandLogo({
  brandId,
  current,
  templatesUrl,
  disabled,
}: {
  brandId: string;
  current: { assetId: string; filename: string; minioKey: string } | null;
  templatesUrl: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function save(assetId: string | null) {
    setError(null);
    const res = await fetch(`/api/brands/${brandId}/logo`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "That logo did not save. Try again.");
      return;
    }
    router.refresh();
  }

  // The templates app streams objects by key, the same path a poster's images
  // take, so the preview here is exactly what a render will draw.
  const preview = current
    ? `${templatesUrl}/api/image/${current.minioKey
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <FileDrop
        kind="image"
        accept="image/png,image/svg+xml,image/webp"
        label="Logo"
        hint="A PNG or SVG with a transparent background. Posters show the brand name instead when there is no logo."
        current={
          current && preview ? { filename: current.filename, url: preview } : null
        }
        disabled={disabled}
        onUploaded={(asset) => save(asset.id)}
        onClear={() => save(null)}
      />
      {error ? (
        <p role="alert" className="text-sm text-[var(--error)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
