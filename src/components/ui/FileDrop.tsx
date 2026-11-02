"use client";

import { useId, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadAsset, type AssetKind, type UploadedAsset } from "@/lib/upload";

/**
 * One slot that takes one file. Shows real upload progress and a real error,
 * never a bare spinner.
 */
export function FileDrop({
  kind,
  accept,
  label,
  hint,
  current,
  onUploaded,
  onClear,
  disabled,
}: {
  kind: AssetKind;
  accept: string;
  label: string;
  hint?: string;
  current?: { filename: string; url: string } | null;
  /**
   * The stored asset, and the file it came from. The file is handed over too
   * because some callers need to look inside the bytes the person just chose —
   * a narration recording is measured for its pauses — and downloading it back
   * from the bucket to do that would be daft when it is already here.
   */
  onUploaded: (asset: UploadedAsset, file: File) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const asset = await uploadAsset(file, kind, setProgress);
      await onUploaded(asset, file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That upload did not finish.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = progress !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>

      {current ? (
        <div
          className="flex items-center justify-between gap-2 rounded border px-3 py-2"
          style={{ borderColor: "var(--line-strong)" }}
        >
          <span className="truncate text-sm">{current.filename}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || busy}
              className="rounded px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-[rgba(27,36,48,0.05)] hover:text-ink"
            >
              Replace
            </button>
            {onClear ? (
              <button
                type="button"
                onClick={() => onClear()}
                disabled={disabled || busy}
                aria-label={`Remove ${current.filename}`}
                className="rounded p-1 text-ink-muted transition-colors hover:bg-[rgba(27,36,48,0.05)] hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.9} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded border border-dashed px-3 py-6 text-center transition-colors",
            dragging
              ? "border-brass bg-[color-mix(in_srgb,var(--brass)_7%,transparent)]"
              : "border-[var(--line-strong)] hover:border-ink-muted",
            (disabled || busy) && "pointer-events-none opacity-60"
          )}
        >
          <Upload className="h-4 w-4 text-ink-muted" strokeWidth={1.9} aria-hidden />
          <span className="text-sm text-ink-muted">
            {busy ? `Uploading, ${progress}%` : "Drop a file here, or choose one"}
          </span>
        </label>
      )}

      {busy ? (
        <div
          className="h-1 overflow-hidden rounded-full"
          style={{ background: "var(--line)" }}
          role="progressbar"
          aria-valuenow={progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-brass transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--error)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-muted">{hint}</p>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
