"use client";

import { useMemo, useRef } from "react";
import { Play, Square, ImageOff, Clock } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { AnnouncementView, SectionView } from "@/lib/announcements";

/**
 * The Section Strip.
 *
 * Each card's width is proportional to the length of that section's audio, so
 * the strip previews the shape and runtime of the finished video before
 * anything renders. Intro and outro are fixed bookends. A section whose audio
 * has not resolved yet sits at a placeholder width and animates out to its
 * true width the moment a duration arrives.
 */

/** Pixels per second of audio. */
const PX_PER_SECOND = 26;
/** Below this a card is unreadable; above it one long section eats the strip. */
const MIN_WIDTH = 76;
const MAX_WIDTH = 320;
/** What an unresolved card sits at while it waits for a duration. */
const PENDING_WIDTH = 96;
const BOOKEND_WIDTH = 64;

function widthFor(durationMs: number | null): number {
  if (durationMs == null) return PENDING_WIDTH;
  const px = (durationMs / 1000) * PX_PER_SECOND;
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, px)));
}

export function SectionStrip({
  announcement,
  selectedId,
  onSelect,
  onMoveBoundary,
}: {
  announcement: AnnouncementView;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Set only in narration mode, where the boundaries between sections are the
   * person's to move. `atMs` is measured from the start of the recording.
   */
  onMoveBoundary?: (index: number, atMs: number) => void | Promise<void>;
}) {
  const { sections, totalMs } = announcement;

  const resolved = useMemo(
    () => sections.filter((s) => s.durationMs != null).length,
    [sections]
  );
  const pending = sections.length - resolved;

  return (
    <section aria-label="Section strip" className="card overflow-hidden">
      <header
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-base">Runtime</h2>
          <span
            className="font-mono text-lg font-medium text-ink"
            data-numeric
            aria-live="polite"
          >
            {formatDuration(totalMs)}
          </span>
        </div>
        <p className="text-sm text-ink-muted">
          {sections.length === 0
            ? "No sections yet"
            : pending === 0
              ? `${sections.length} ${sections.length === 1 ? "section" : "sections"}, all timed`
              : `${resolved} of ${sections.length} timed. The runtime grows as the rest resolve.`}
        </p>
      </header>

      {sections.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-muted">
          Add a section and the strip will show how long the video runs.
        </p>
      ) : (
        <div className="scroll-quiet overflow-x-auto px-4 py-4">
          <ol className="flex items-stretch gap-1.5">
            <Bookend label="Intro" present={Boolean(announcement.intro)} />

            {sections.map((section, index) => (
              <SectionCard
                key={section.id}
                section={section}
                index={index}
                selected={section.id === selectedId}
                onSelect={onSelect}
              />
            ))}

            <Bookend label="Outro" present={Boolean(announcement.outro)} />
          </ol>

          {announcement.narration && onMoveBoundary ? (
            <NarrationTimeline
              sections={sections}
              totalMs={totalMs}
              selectedId={selectedId}
              onSelect={onSelect}
              onMoveBoundary={onMoveBoundary}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

/** How far one arrow-key press moves a boundary, and with shift held. */
const NUDGE_MS = 100;
const NUDGE_COARSE_MS = 1000;

/**
 * The narration laid out end to end, divided where each poster changes.
 *
 * This is a proportional map of the recording rather than a drawn waveform:
 * showing real peaks would mean downloading and decoding the audio again on
 * every page load, and what the person actually needs here is to see where the
 * cuts fell and take hold of one that landed wrong.
 *
 * Handles are real buttons, so a boundary can be nudged with the arrow keys as
 * well as dragged. A cut a fifth of a second out is hard to hit with a mouse and
 * trivial with a key press.
 */
function NarrationTimeline({
  sections,
  totalMs,
  selectedId,
  onSelect,
  onMoveBoundary,
}: {
  sections: SectionView[];
  totalMs: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveBoundary: (index: number, atMs: number) => void | Promise<void>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  if (totalMs <= 0 || sections.length === 0) return null;

  const pct = (ms: number) => `${(ms / totalMs) * 100}%`;

  function msAt(clientX: number): number | null {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.round(Math.min(1, Math.max(0, ratio)) * totalMs);
  }

  return (
    <div className="mt-4">
      <div
        ref={trackRef}
        className="relative h-12 w-full overflow-hidden rounded border"
        style={{ borderColor: "var(--line-strong)" }}
      >
        {sections.map((section, index) => {
          const start = section.startMs ?? 0;
          const length = section.durationMs ?? 0;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-pressed={section.id === selectedId}
              title={`Section ${index + 1}, ${formatDuration(length)}`}
              className={cn(
                "absolute top-0 h-full border-r text-xs transition-colors",
                section.id === selectedId
                  ? "bg-[color-mix(in_srgb,var(--brass)_22%,transparent)]"
                  : "hover:bg-[rgba(27,36,48,0.05)]"
              )}
              style={{
                left: pct(start),
                width: pct(length),
                borderColor: "var(--line)",
              }}
            >
              <span className="px-1 text-ink-muted">{index + 1}</span>
            </button>
          );
        })}

        {sections.slice(0, -1).map((section, index) => {
          const at = (section.startMs ?? 0) + (section.durationMs ?? 0);
          const next = sections[index + 1];
          const min = (section.startMs ?? 0) + 1;
          const max = (next.startMs ?? 0) + (next.durationMs ?? 0) - 1;
          return (
            <button
              key={`handle-${section.id}`}
              type="button"
              role="slider"
              aria-label={`Boundary between section ${index + 1} and ${index + 2}`}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={at}
              aria-valuetext={formatDuration(at)}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const ms = msAt(e.clientX);
                if (ms != null) void onMoveBoundary(index, ms);
              }}
              onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? NUDGE_COARSE_MS : NUDGE_MS;
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  void onMoveBoundary(index, at - step);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  void onMoveBoundary(index, at + step);
                }
              }}
              // Wide enough to grab, drawn as a thin line.
              className="absolute top-0 h-full w-4 -translate-x-1/2 cursor-col-resize
                         before:absolute before:inset-y-0 before:left-1/2 before:w-0.5
                         before:-translate-x-1/2 before:bg-brass
                         focus-visible:before:w-1"
              style={{ left: pct(at) }}
            />
          );
        })}
      </div>

      <p className="mt-1.5 text-sm text-ink-muted">
        Drag a marker to change where a poster gives way to the next, or select one
        and use the arrow keys.
      </p>
    </div>
  );
}

function SectionCard({
  section,
  index,
  selected,
  onSelect,
}: {
  section: SectionView;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const width = widthFor(section.durationMs);
  const timed = section.durationMs != null;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(section.id)}
        aria-pressed={selected}
        // The width transition is the strip's one piece of motion: a card
        // animates from its placeholder to its true width when audio resolves.
        style={{ width }}
        className={cn(
          "group flex h-32 flex-col overflow-hidden rounded border text-left",
          "transition-[width,border-color,box-shadow] duration-500 ease-strip",
          selected
            ? "border-brass shadow-raised"
            : "border-[var(--line-strong)] hover:border-ink-muted hover:shadow-card"
        )}
      >
        <span className="relative flex-1 overflow-hidden bg-[rgba(27,36,48,0.05)]">
          {section.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={section.poster.url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center">
              <ImageOff
                className="h-4 w-4 text-ink-muted/60"
                strokeWidth={1.75}
                aria-hidden
              />
            </span>
          )}
          <span
            className="absolute left-1 top-1 rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium text-white"
            style={{ background: "rgba(27,36,48,0.72)" }}
          >
            {index + 1}
          </span>
        </span>

        <span
          className="flex items-center justify-between gap-1 border-t px-1.5 py-1"
          style={{ borderColor: "var(--line)" }}
        >
          <span className="truncate text-[11px] text-ink-muted">
            {section.audioSource === "tts" ? "Voiceover" : "Recorded"}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-[11px]",
              timed ? "text-ink" : "text-ink-muted/70"
            )}
            data-numeric
          >
            {timed ? (
              formatDuration(section.durationMs)
            ) : (
              <Clock className="h-3 w-3 animate-working-pulse" aria-label="Timing pending" />
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Intro and outro sit at a fixed width: they are the same every week. */
function Bookend({ label, present }: { label: string; present: boolean }) {
  const Icon = label === "Intro" ? Play : Square;
  return (
    <li>
      <div
        style={{ width: BOOKEND_WIDTH }}
        className={cn(
          "flex h-32 flex-col items-center justify-center gap-1.5 rounded border border-dashed",
          present
            ? "border-[var(--forest)] text-[var(--forest)]"
            : "border-[var(--line-strong)] text-ink-muted/70"
        )}
        title={present ? `${label} is set` : `No ${label.toLowerCase()} chosen yet`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
    </li>
  );
}
