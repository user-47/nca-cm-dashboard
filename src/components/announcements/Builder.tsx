"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Download, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FileDrop } from "@/components/ui/FileDrop";
import { StatusPill } from "@/components/ui/StatusPill";
import { SectionStrip } from "./SectionStrip";
import { SectionEditor } from "./SectionEditor";
import { boundariesForUpload } from "@/lib/narration";
import type { AnnouncementView } from "@/lib/announcements";
import type { Voice } from "@/db/schema";

type VoiceOption = Pick<Voice, "id" | "name" | "language">;

/** Statuses that mean something is still happening and the view should poll. */
const IN_FLIGHT = ["queued", "running", "rendering", "awaiting_review"] as const;

/** Matches the floor the boundary maths uses, so a drag meets a stop. */
const MIN_SECTION_MS = 500;

export function Builder({
  initial,
  voices,
}: {
  initial: AnnouncementView;
  voices: VoiceOption[];
}) {
  const [view, setView] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.sections[0]?.id ?? null
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [narrationNote, setNarrationNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/announcements/${initial.id}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const next = (await res.json()) as AnnouncementView;
    setView(next);
    // A section whose audio has landed is no longer generating.
    setGeneratingIds((prev) => {
      if (prev.size === 0) return prev;
      const still = new Set(prev);
      for (const s of next.sections) {
        if (s.audio) still.delete(s.id);
      }
      return still.size === prev.size ? prev : still;
    });
    return next;
  }, [initial.id]);

  /**
   * Poll while a pipeline is working. Pipelines report through a signed
   * callback into the database, so polling this endpoint is how the browser
   * learns about it. It stops the moment nothing is in flight, which is most
   * of the time.
   */
  const pollingRef = useRef(false);
  useEffect(() => {
    const jobInFlight =
      view.job != null && (IN_FLIGHT as readonly string[]).includes(view.job.status);
    const waitingOnVoiceover = generatingIds.size > 0;
    if (!jobInFlight && !waitingOnVoiceover) return;
    if (pollingRef.current) return;

    pollingRef.current = true;
    const timer = setInterval(() => void refresh(), 2500);
    return () => {
      pollingRef.current = false;
      clearInterval(timer);
    };
  }, [view.job, generatingIds, refresh]);

  async function call(
    input: string,
    init: RequestInit & { label: string }
  ): Promise<unknown | null> {
    const { label, ...request } = init;
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(input, {
        ...request,
        headers: { "content-type": "application/json", ...(request.headers ?? {}) },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That did not go through. Try again.");
        return null;
      }
      return body;
    } catch {
      setError("The server could not be reached. Check that it is running.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const selected = view.sections.find((s) => s.id === selectedId) ?? null;
  const selectedIndex = view.sections.findIndex((s) => s.id === selectedId);

  async function addSection() {
    const created = (await call(`/api/announcements/${view.id}/sections`, {
      method: "POST",
      body: JSON.stringify({ text: "" }),
      label: "add",
    })) as { id: string } | null;
    if (!created) return;
    await refresh();
    setSelectedId(created.id);
  }

  async function patchSection(id: string, patch: Record<string, unknown>) {
    await call(`/api/sections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      label: "save",
    });
    await refresh();
  }

  async function deleteSection(id: string) {
    await call(`/api/sections/${id}`, { method: "DELETE", label: "delete" });
    const next = await refresh();
    setSelectedId(next?.sections[0]?.id ?? null);
  }

  async function moveSection(id: string, direction: -1 | 1) {
    const order = view.sections.map((s) => s.id);
    const from = order.indexOf(id);
    const to = from + direction;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];

    // Reorder locally first so the strip does not lurch while the write lands.
    setView((prev) => ({
      ...prev,
      sections: order.map(
        (sid, i) => ({ ...prev.sections.find((s) => s.id === sid)!, position: i })
      ),
    }));

    await call(`/api/announcements/${view.id}/sections`, {
      method: "PATCH",
      body: JSON.stringify({ order }),
      label: "reorder",
    });
    await refresh();
  }

  async function generateVoiceover(id: string) {
    const started = await call(`/api/sections/${id}/voiceover`, {
      method: "POST",
      label: "voiceover",
    });
    if (started) setGeneratingIds((prev) => new Set(prev).add(id));
    await refresh();
  }

  /**
   * Take in one recording for the whole announcement and work out where each
   * poster changes.
   *
   * The pauses are found here in the browser, from the file the person just
   * chose, rather than in a pipeline. It is the same trick the uploader already
   * uses to measure a clip's length, and it means the strip resolves while they
   * are still looking at it instead of after a round trip.
   */
  async function applyNarration(assetId: string, file: File) {
    setNarrationNote(null);

    const saved = await call(`/api/announcements/${view.id}`, {
      method: "PATCH",
      body: JSON.stringify({ narrationAssetId: assetId }),
      label: "narration",
    });
    if (!saved) return;

    const ordered = [...view.sections].sort((a, b) => a.position - b.position);
    if (ordered.length === 0) {
      await refresh();
      return;
    }

    setBusy("narration");
    try {
      const { spans, method } = await boundariesForUpload(
        file,
        ordered.map((s) => s.text.trim().length)
      );
      await call(`/api/announcements/${view.id}/boundaries`, {
        method: "PUT",
        body: JSON.stringify({
          spans: spans.map((span, i) => ({ sectionId: ordered[i].id, ...span })),
        }),
        label: "narration",
      });
      setNarrationNote(
        method === "pauses"
          ? "Sections were placed on the pauses in your recording. Drag a handle on the strip to move one."
          : "There were not enough clear pauses to find the breaks, so the sections were split by how much script each one carries. Check the handles on the strip before you render."
      );
    } catch {
      setError(
        "That recording could not be read. Check it plays, or use a WAV or MP3 file."
      );
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  /** Re-times two neighbours after a handle on the strip is dragged. */
  async function moveBoundary(index: number, atMs: number) {
    const ordered = [...view.sections].sort((a, b) => a.position - b.position);
    const spans = ordered.map((s) => ({
      sectionId: s.id,
      startMs: s.startMs ?? 0,
      durationMs: s.durationMs ?? 0,
    }));
    const left = spans[index];
    const right = spans[index + 1];
    if (!left || !right) return;

    const end = right.startMs + right.durationMs;
    const clamped = Math.round(
      Math.min(Math.max(atMs, left.startMs + MIN_SECTION_MS), end - MIN_SECTION_MS)
    );
    left.durationMs = clamped - left.startMs;
    right.startMs = clamped;
    right.durationMs = end - clamped;

    // Show the new shape immediately; the strip should track the handle, not
    // the round trip.
    setView((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        const span = spans.find((x) => x.sectionId === s.id);
        return span ? { ...s, startMs: span.startMs, durationMs: span.durationMs } : s;
      }),
    }));

    await call(`/api/announcements/${view.id}/boundaries`, {
      method: "PUT",
      body: JSON.stringify({ spans }),
      label: "boundary",
    });
  }

  async function createVideo() {
    const started = await call(`/api/announcements/${view.id}/render`, {
      method: "POST",
      label: "render",
    });
    if (started) await refresh();
  }

  const rendering =
    view.job != null && (IN_FLIGHT as readonly string[]).includes(view.job.status);

  return (
    <div className="flex flex-col gap-5">
      <SectionStrip
        announcement={view}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMoveBoundary={view.narration ? moveBoundary : undefined}
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

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {selected ? (
            <SectionEditor
              key={selected.id}
              section={selected}
              index={selectedIndex}
              count={view.sections.length}
              voices={voices}
              generating={generatingIds.has(selected.id)}
              narrated={Boolean(view.narration)}
              onPatch={(patch) => patchSection(selected.id, patch)}
              onDelete={() => deleteSection(selected.id)}
              onMove={(d) => moveSection(selected.id, d)}
              onGenerate={() => generateVoiceover(selected.id)}
            />
          ) : (
            <div className="card px-6 py-12 text-center">
              <h2 className="text-lg">Start with the first section</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
                Each section is one poster. Give it its own audio, or upload one
                recording covering the whole video and let the pauses in it decide
                where each poster changes.
              </p>
            </div>
          )}

          <Button variant="secondary" onClick={() => void addSection()} disabled={busy === "add"}>
            <Plus className="h-4 w-4" strokeWidth={1.9} aria-hidden />
            Add section
          </Button>
        </div>

        <aside className="flex flex-col gap-5">
          <div className="card flex flex-col gap-4 p-5">
            <h2 className="text-base">Narration</h2>
            <FileDrop
              kind="audio"
              accept="audio/*"
              label="One recording for the whole video"
              hint="Record every section in one take. The pauses in it decide where each poster changes, and you can move any of them on the strip."
              current={view.narration}
              disabled={rendering}
              onUploaded={(asset, file) => applyNarration(asset.id, file)}
              onClear={async () => {
                setNarrationNote(null);
                await call(`/api/announcements/${view.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ narrationAssetId: null }),
                  label: "narration",
                });
                await refresh();
              }}
            />
            {narrationNote ? (
              <p className="text-sm text-ink-muted">{narrationNote}</p>
            ) : (
              <p className="text-sm text-ink-muted">
                Leave this empty to give each section its own audio instead.
              </p>
            )}
          </div>

          <div className="card flex flex-col gap-4 p-5">
            <h2 className="text-base">Bookends</h2>
            <FileDrop
              kind="video"
              accept="video/*"
              label="Intro"
              current={view.intro}
              onUploaded={async (asset) => {
                await call(`/api/announcements/${view.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ introAssetId: asset.id }),
                  label: "intro",
                });
                await refresh();
              }}
              onClear={async () => {
                await call(`/api/announcements/${view.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ introAssetId: null }),
                  label: "intro",
                });
                await refresh();
              }}
            />
            <FileDrop
              kind="video"
              accept="video/*"
              label="Outro"
              current={view.outro}
              onUploaded={async (asset) => {
                await call(`/api/announcements/${view.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ outroAssetId: asset.id }),
                  label: "outro",
                });
                await refresh();
              }}
              onClear={async () => {
                await call(`/api/announcements/${view.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ outroAssetId: null }),
                  label: "outro",
                });
                await refresh();
              }}
            />
          </div>

          <div className="card flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base">Video</h2>
              {view.job ? <StatusPill status={view.job.status} /> : null}
            </div>

            {view.job && rendering ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-muted">
                  {view.job.stepLabel ?? "Working on it."}
                </p>
                <div
                  className="h-1 overflow-hidden rounded-full"
                  style={{ background: "var(--line)" }}
                  role="progressbar"
                  aria-valuenow={view.job.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-brass transition-[width] duration-500"
                    style={{ width: `${Math.max(view.job.progress, 4)}%` }}
                  />
                </div>
                <p className="text-sm text-ink-muted">
                  You can leave this page. The job keeps running.
                </p>
              </div>
            ) : null}

            {view.job?.status === "failed" ? (
              <p className="text-sm text-[var(--error)]">
                {view.job.errorText ??
                  "The render stopped and did not say why. Check the n8n execution log."}
              </p>
            ) : null}

            {view.rendered ? (
              <div className="flex flex-col gap-3">
                <video
                  controls
                  src={view.rendered.url}
                  className="w-full rounded"
                  preload="metadata"
                />
                <a
                  href={view.rendered.url}
                  download={view.rendered.filename}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded border px-4 text-base font-medium transition-colors hover:bg-paper"
                  style={{ borderColor: "var(--line-strong)" }}
                >
                  <Download className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                  Download video
                </a>
              </div>
            ) : null}

            {!view.readyToRender && view.sections.length > 0 ? (
              <p className="text-sm text-ink-muted">
                Every section needs a poster and audio before the video can be made.
              </p>
            ) : null}

            <Button
              variant="primary"
              onClick={() => void createVideo()}
              disabled={!view.readyToRender || rendering || busy === "render"}
            >
              {view.rendered ? (
                <>
                  <RotateCw className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                  Create video again
                </>
              ) : (
                "Create video"
              )}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
