"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Wand2, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Textarea, Select } from "@/components/ui/Field";
import { FileDrop } from "@/components/ui/FileDrop";
import { formatDuration } from "@/lib/utils";
import type { SectionView } from "@/lib/announcements";
import type { Voice } from "@/db/schema";

export function SectionEditor({
  section,
  index,
  count,
  voices,
  onPatch,
  onDelete,
  onMove,
  onGenerate,
  generating,
  narrated,
}: {
  section: SectionView;
  index: number;
  count: number;
  voices: Pick<Voice, "id" | "name" | "language">[];
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onGenerate: () => Promise<void>;
  generating: boolean;
  /** True when one recording covers the whole video, so this section has a span
   * of it rather than audio of its own. */
  narrated: boolean;
}) {
  const [text, setText] = useState(section.text);
  const [error, setError] = useState<string | null>(null);
  const savedText = useRef(section.text);

  // Switching sections must not carry the previous section's draft across.
  useEffect(() => {
    setText(section.text);
    savedText.current = section.text;
    setError(null);
  }, [section.id, section.text]);

  async function saveText() {
    if (text === savedText.current) return;
    savedText.current = text;
    await onPatch({ text });
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not go through.");
    }
  }

  return (
    <div className="card flex flex-col gap-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base">Section {index + 1}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="quiet"
            size="sm"
            aria-label="Move section earlier"
            disabled={index === 0}
            onClick={() => void run(() => onMove(-1))}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-label="Move section later"
            disabled={index === count - 1}
            onClick={() => void run(() => onMove(1))}
          >
            <ArrowRight className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-label="Remove this section"
            onClick={() => void run(onDelete)}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          </Button>
        </div>
      </div>

      <Field
        label="What this section says"
        htmlFor={`text-${section.id}`}
        hint={
          narrated
            ? "Read this aloud in your recording. How much each section says is what tells the strip roughly where the pauses belong."
            : "Used for the voiceover. If you are uploading your own audio, this is just a note to yourself."
        }
      >
        <Textarea
          id={`text-${section.id}`}
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void saveText()}
          placeholder="Sunday service moves to nine thirty from the first of the month."
        />
      </Field>

      <FileDrop
        kind="image"
        accept="image/*"
        label="Poster"
        hint={
          narrated
            ? "Shown for this section's stretch of the narration."
            : "Shown for the whole length of this section's audio."
        }
        current={section.poster}
        onUploaded={(asset) => onPatch({ posterAssetId: asset.id })}
        onClear={() => onPatch({ posterAssetId: null })}
      />

      {narrated ? (
        <div className="flex flex-col gap-1.5">
          <span className="label">Audio</span>
          <p className="text-sm text-ink-muted">
            {section.durationMs != null && section.startMs != null
              ? `Your narration covers this section from ${formatDuration(
                  section.startMs
                )} to ${formatDuration(section.startMs + section.durationMs)}, so the poster holds for ${formatDuration(section.durationMs)}.`
              : "This section has no place in the narration yet. Set its boundaries on the strip."}
          </p>
          <p className="text-sm text-ink-muted">
            Move the markers on the strip to change it, or remove the narration to
            give each section its own audio.
          </p>
        </div>
      ) : (
      <div className="flex flex-col gap-3">
        <Field label="Audio" htmlFor={`source-${section.id}`}>
          <Select
            id={`source-${section.id}`}
            value={section.audioSource}
            onChange={(e) => void onPatch({ audioSource: e.target.value })}
          >
            <option value="recorded">Record or upload audio</option>
            <option value="tts">Generate voiceover</option>
          </Select>
        </Field>

        {section.audioSource === "tts" ? (
          <>
            <Field
              label="Voice"
              htmlFor={`voice-${section.id}`}
              hint={
                voices.length === 0
                  ? "No voices yet. Add one in Settings."
                  : undefined
              }
            >
              <Select
                id={`voice-${section.id}`}
                value={section.voiceId ?? ""}
                disabled={voices.length === 0}
                onChange={(e) => void onPatch({ voiceId: e.target.value || null })}
              >
                <option value="">Church default</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.language})
                  </option>
                ))}
              </Select>
            </Field>

            <Button
              variant="secondary"
              onClick={() => void run(onGenerate)}
              disabled={generating || !text.trim() || voices.length === 0}
            >
              <Wand2 className="h-4 w-4" strokeWidth={1.9} aria-hidden />
              {generating ? "Generating voiceover" : "Generate voiceover"}
            </Button>
          </>
        ) : (
          <FileDrop
            kind="audio"
            accept="audio/*"
            label="Audio for this section"
            hint="One file for this section. Its length sets how long the poster stays on screen."
            current={section.audio}
            onUploaded={(asset) =>
              onPatch({
                audioAssetId: asset.id,
                audioSource: "recorded",
                durationMs: (asset.metaJson?.durationMs as number | undefined) ?? null,
              })
            }
            onClear={() => onPatch({ audioAssetId: null })}
          />
        )}

        {section.audio ? (
          <div className="flex flex-col gap-2">
            <audio
              controls
              src={section.audio.url}
              className="w-full"
              preload="none"
            />
            <p className="text-sm text-ink-muted">
              This section runs{" "}
              <span className="font-mono" data-numeric>
                {formatDuration(section.durationMs)}
              </span>
              .
            </p>
          </div>
        ) : null}
      </div>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded px-3 py-2 text-sm text-[var(--error)]"
          style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
