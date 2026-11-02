"use client";

import type { BrandTokens } from "@nca/brand-tokens";
import { CURATED_PAIRS, FONT_REGISTRY } from "@nca/brand-tokens";
import { Field, Input, Select } from "@/components/ui/Field";

/**
 * The tokens a poster was read as, laid out so a person can correct them.
 *
 * Only the parts worth arguing with are editable: colours, the type pairing,
 * and the mood line. Radii, motifs, and the model's notes pass through
 * unchanged — nobody wants to hand-tune a corner radius, and the notes are a
 * record of how the poster was read rather than something to rewrite.
 */

const COLOUR_FIELDS: Array<{
  key: keyof BrandTokens["colors"];
  label: string;
  hint: string;
}> = [
  { key: "primary", label: "Primary", hint: "Large fills and structural blocks." },
  { key: "onPrimary", label: "On primary", hint: "Text placed on the primary colour." },
  { key: "accent", label: "Accent", hint: "The single highlight. Used sparingly." },
  { key: "surface", label: "Surface", hint: "Page background." },
  { key: "surfaceAlt", label: "Surface alt", hint: "Cards laid over the surface." },
  { key: "ink", label: "Ink", hint: "Body text on the surface." },
  { key: "inkMuted", label: "Ink muted", hint: "Captions and metadata." },
];

export function BrandTokenForm({
  tokens,
  onChange,
  disabled,
}: {
  tokens: BrandTokens;
  onChange: (next: BrandTokens) => void;
  disabled?: boolean;
}) {
  function setColour(key: keyof BrandTokens["colors"], value: string) {
    onChange({ ...tokens, colors: { ...tokens.colors, [key]: value } });
  }

  // The pairing is chosen as a unit: display and body faces are picked to work
  // together, and letting them be mixed freely mostly produces worse posters.
  const currentPair =
    CURATED_PAIRS.find(
      (p) => p.display === tokens.fonts.display && p.body === tokens.fonts.body
    )?.id ?? "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="label">Colours</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {COLOUR_FIELDS.map(({ key, label, hint }) => {
            const value = tokens.colors[key];
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded border px-3 py-2"
                style={{ borderColor: "var(--line-strong)" }}
              >
                <input
                  type="color"
                  aria-label={label}
                  value={value}
                  disabled={disabled}
                  onChange={(e) => setColour(key, e.target.value.toUpperCase())}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-ink-muted">{hint}</p>
                </div>
                <input
                  aria-label={`${label} hex`}
                  value={value}
                  disabled={disabled}
                  spellCheck={false}
                  onChange={(e) => setColour(key, e.target.value.toUpperCase())}
                  className="w-24 shrink-0 rounded border bg-surface px-2 py-1 text-center font-mono text-xs"
                  style={{ borderColor: "var(--line)" }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <Field
        label="Type"
        htmlFor="brand-pair"
        hint={`${FONT_REGISTRY[tokens.fonts.display].family} for headings, ${FONT_REGISTRY[tokens.fonts.body].family} for body text.`}
      >
        <Select
          id="brand-pair"
          value={currentPair}
          disabled={disabled}
          onChange={(e) => {
            const pair = CURATED_PAIRS.find((p) => p.id === e.target.value);
            if (!pair) return;
            onChange({
              ...tokens,
              fonts: { ...tokens.fonts, display: pair.display, body: pair.body },
            });
          }}
        >
          {currentPair === "" ? (
            <option value="">
              {FONT_REGISTRY[tokens.fonts.display].family} +{" "}
              {FONT_REGISTRY[tokens.fonts.body].family}
            </option>
          ) : null}
          {CURATED_PAIRS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}: {FONT_REGISTRY[p.display].family} +{" "}
              {FONT_REGISTRY[p.body].family}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Mood"
        htmlFor="brand-mood"
        hint="Shown in the brand list. It does not affect the poster."
      >
        <Input
          id="brand-mood"
          value={tokens.mood}
          maxLength={80}
          disabled={disabled}
          onChange={(e) => onChange({ ...tokens, mood: e.target.value })}
        />
      </Field>

      {tokens.motifs.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="label">Motifs read from the poster</span>
          <div className="flex flex-wrap gap-1.5">
            {tokens.motifs.map((m) => (
              <span
                key={m}
                className="rounded-full px-2.5 py-1 text-xs"
                style={{ background: "rgba(27,36,48,0.06)" }}
              >
                {m.replace(/-/g, " ")}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {tokens.notes ? (
        <div className="flex flex-col gap-1.5">
          <span className="label">How it was read</span>
          <p className="text-sm text-ink-muted">{tokens.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
