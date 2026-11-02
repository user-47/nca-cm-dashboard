"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export type VoiceRow = {
  id: string;
  name: string;
  provider: "kokoro" | "fish";
  providerVoiceId: string;
  language: string;
  isDefault: boolean;
  sampleUrl: string | null;
};

const PROVIDER_LABEL: Record<VoiceRow["provider"], string> = {
  kokoro: "Kokoro (self-hosted)",
  fish: "Fish Audio",
};

export function VoiceManager({
  initial,
  canEdit,
}: {
  initial: VoiceRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function call(input: string, init: RequestInit, label: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(input, {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That did not go through. Try again.");
        return null;
      }
      return body ?? {};
    } catch {
      setError("The server could not be reached. Check that it is running.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function addVoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const created = await call(
      "/api/voices",
      {
        method: "POST",
        body: JSON.stringify({
          name: String(data.get("name") ?? "").trim(),
          provider: data.get("provider"),
          providerVoiceId: String(data.get("providerVoiceId") ?? "").trim(),
          language: String(data.get("language") ?? "en").trim(),
          isDefault: initial.length === 0,
        }),
      },
      "add"
    );
    if (created) {
      setAdding(false);
      router.refresh();
    }
  }

  async function testVoice(id: string) {
    const started = await call(`/api/voices/${id}/test`, { method: "POST" }, `test-${id}`);
    if (started) {
      setNotice(
        "The voice is speaking a test line. It appears here in a few seconds. Reload if it does not."
      );
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg">Voices</h2>
          <p className="mt-1 text-sm text-ink-muted">
            The voices your team can pick when generating a voiceover.
          </p>
        </div>
        {canEdit && !adding && initial.length > 0 ? (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.9} aria-hidden />
            Add voice
          </Button>
        ) : null}
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
      {notice ? (
        <p className="rounded px-3 py-2 text-sm text-ink-muted" style={{ background: "rgba(27,36,48,0.04)" }}>
          {notice}
        </p>
      ) : null}

      {adding ? (
        <form onSubmit={addVoice} className="card flex flex-col gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="voice-name" hint="What your team will see.">
              <Input id="voice-name" name="name" required autoFocus placeholder="Sunday announcer" />
            </Field>
            <Field label="Provider" htmlFor="voice-provider">
              <Select id="voice-provider" name="provider" defaultValue="kokoro">
                <option value="kokoro">Kokoro (self-hosted)</option>
                <option value="fish">Fish Audio</option>
              </Select>
            </Field>
            <Field
              label="Voice id"
              htmlFor="voice-id"
              hint="The identifier the provider uses, such as af_heart."
            >
              <Input id="voice-id" name="providerVoiceId" required placeholder="af_heart" />
            </Field>
            <Field
              label="Language"
              htmlFor="voice-lang"
              hint="Kokoro's English is strong. For French, prefer Fish and listen before you commit."
            >
              <Input id="voice-lang" name="language" defaultValue="en" required />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy === "add"}>
              {busy === "add" ? "Adding voice" : "Add voice"}
            </Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {initial.length === 0 && !adding ? (
        <EmptyState
          title="No voices yet"
          body="Add a voice and your team can generate a voiceover for any section. You need at least one before the announcement builder can speak."
          action={
            canEdit ? (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                Add voice
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {initial.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {initial.map((voice) => (
            <li key={voice.id} className="card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {voice.name}
                    {voice.isDefault ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          background: "color-mix(in srgb, var(--forest) 14%, transparent)",
                          color: "var(--forest)",
                        }}
                      >
                        Default
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {PROVIDER_LABEL[voice.provider]} ·{" "}
                    <span className="font-mono text-[13px]">{voice.providerVoiceId}</span> ·{" "}
                    {voice.language}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    onClick={() => void testVoice(voice.id)}
                    disabled={busy === `test-${voice.id}`}
                  >
                    <Play className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
                    {busy === `test-${voice.id}` ? "Testing" : "Test"}
                  </Button>
                  {canEdit ? (
                    <>
                      <Button
                        size="sm"
                        variant="quiet"
                        aria-label={`Make ${voice.name} the default voice`}
                        title="Make default"
                        disabled={voice.isDefault}
                        onClick={async () => {
                          const ok = await call(
                            `/api/voices/${voice.id}`,
                            { method: "PATCH", body: JSON.stringify({ isDefault: true }) },
                            `default-${voice.id}`
                          );
                          if (ok) router.refresh();
                        }}
                      >
                        <Star
                          className={cn("h-4 w-4", voice.isDefault && "fill-current")}
                          strokeWidth={1.9}
                          aria-hidden
                        />
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        aria-label={`Remove ${voice.name}`}
                        onClick={async () => {
                          const ok = await call(
                            `/api/voices/${voice.id}`,
                            { method: "DELETE" },
                            `delete-${voice.id}`
                          );
                          if (ok) router.refresh();
                        }}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {voice.sampleUrl ? (
                <audio controls src={voice.sampleUrl} className="w-full" preload="none" />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
