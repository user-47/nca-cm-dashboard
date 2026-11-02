"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Wand2, X } from "lucide-react";
import { brandTokens, type BrandTokens } from "@nca/brand-tokens";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import { BrandTokenForm } from "./BrandTokenForm";

type Extracted = {
  referenceId: string;
  sourceUrl: string;
  tokens: BrandTokens;
  model: string;
};

/**
 * Upload a poster, see what it was read as, correct it, save it as a brand.
 *
 * There is deliberately no "use for this poster only" option. A poster reaches
 * its church through its brand, so tokens with no brand behind them would need
 * a second, parallel path through the whole render chain. Saving a brand and
 * deleting it later is the same outcome with one concept instead of two.
 */
export function ExtractReference() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<Extracted | null>(null);
  const [tokens, setTokens] = useState<BrandTokens | null>(null);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  function reset() {
    setOpen(false);
    setResult(null);
    setTokens(null);
    setName("");
    setMakeDefault(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const form = new FormData();
      form.append("image", file);

      const res = await fetch("/api/brands/extract", { method: "POST", body: form });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(body?.error ?? "That poster could not be read.");
        return;
      }

      const parsed = brandTokens.safeParse(body.tokens);
      if (!parsed.success) {
        setError("The colours came back in a form this app cannot use. Try another image.");
        return;
      }

      setResult({ ...body, tokens: parsed.data });
      setTokens(parsed.data);
      // A sensible starting name; the person almost always renames it.
      setName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 60));
    } catch {
      setError("The server could not be reached. Check that it is running.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function save() {
    if (!tokens || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tokens,
          makeDefault,
          referenceId: result?.referenceId ?? null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That brand could not be saved.");
        return;
      }
      reset();
      router.refresh();
    } catch {
      setError("The server could not be reached. Check that it is running.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Wand2 className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        Read a brand from a poster
      </Button>
    );
  }

  return (
    <section className="card flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base">Read a brand from a poster</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Upload something you like the look of. Its colours and type become a
            brand you can use, and you can correct anything before saving.
          </p>
        </div>
        <Button variant="quiet" size="sm" aria-label="Close" onClick={reset}>
          <X className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded px-3 py-2 text-sm text-[var(--error)]"
          style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)" }}
        >
          {error}
        </p>
      ) : null}

      {!result ? (
        <>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void read(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed px-4 py-10 text-center transition-colors",
              dragging
                ? "border-brass bg-[color-mix(in_srgb,var(--brass)_7%,transparent)]"
                : "border-[var(--line-strong)] hover:border-ink-muted",
              reading && "pointer-events-none opacity-60"
            )}
          >
            <Upload className="h-5 w-5 text-ink-muted" strokeWidth={1.9} aria-hidden />
            <span className="text-sm text-ink-muted">
              {reading
                ? "Reading the poster. This takes about ten seconds."
                : "Drop a poster here, or choose one"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              disabled={reading}
              onChange={(e) => void read(e.target.files?.[0])}
            />
          </label>
          {reading ? (
            <div
              className="h-1 overflow-hidden rounded-full"
              style={{ background: "var(--line)" }}
              role="progressbar"
              aria-label="Reading the poster"
            >
              <div className="h-full w-1/3 animate-working-pulse bg-brass" />
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
          <div className="flex flex-col gap-2">
            <span className="label">Read from</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.sourceUrl}
              alt="The poster this brand was read from"
              className="w-full rounded border"
              style={{ borderColor: "var(--line)" }}
            />
            <p className="font-mono text-xs text-ink-muted">{result.model}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Field label="Brand name" htmlFor="brand-name">
              <Input
                id="brand-name"
                value={name}
                maxLength={80}
                autoFocus
                disabled={saving}
                onChange={(e) => setName(e.target.value)}
                placeholder="Autumn series"
              />
            </Field>

            {tokens ? (
              <BrandTokenForm tokens={tokens} onChange={setTokens} disabled={saving} />
            ) : null}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={makeDefault}
                disabled={saving}
                onChange={(e) => setMakeDefault(e.target.checked)}
              />
              Make this the default brand for new posters
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={saving || !name.trim()}
                onClick={() => void save()}
              >
                {saving ? "Saving brand" : "Save as new brand"}
              </Button>
              <Button disabled={saving} onClick={reset}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
