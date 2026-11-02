import { z } from "zod";

/**
 * Fonts are a closed set of tags, not free text.
 *
 * Two reasons. Style extraction from a reference poster asks Claude for a
 * descriptive tag ("serif-bold-display"), never a family name, because a model
 * guessing "Söhne" gives us something we cannot legally or practically serve.
 * And a template must never trigger a network font fetch: Playwright will race
 * it and screenshot a fallback face. Every tag below resolves to a .woff2 we
 * host ourselves in services/templates/public/fonts.
 */

/**
 * Two families of display face, and the distinction matters.
 *
 * The first five are *editorial*: they set a heading well inside a layout. The
 * last five are *poster* faces, which carry a composition on their own at very
 * large sizes. A church event poster is usually carried by its type, so without
 * the second group every poster comes out looking like a page rather than a
 * poster, however good the rest of the design system is.
 */
export const displayFontTag = z.enum([
  // Editorial
  "serif-editorial", // Spectral: warm, printed, bulletin-like
  "serif-bold-display", // Fraunces: high-contrast, characterful
  "slab-display", // Roboto Slab: sturdy, plain-spoken
  "sans-geometric-display", // Outfit: clean, modern, circular
  "condensed-display", // Archivo Narrow: tall, tight, poster-ish
  // Poster
  "slab-poster", // Alfa Slab One: heavy letterpress slab, takes grain well
  "sans-condensed-heavy", // Anton: ultra-heavy condensed, stacked words
  "sans-black", // Archivo Black: weight without condensing
  "caps-tall", // Bebas Neue: tall all-caps, eyebrows and date rows
  "caps-display", // Staatliches: condensed display caps, slightly rough
]);

export const bodyFontTag = z.enum([
  "sans-grotesque", // IBM Plex Sans: the product's working face
  "sans-neutral", // Inter: quiet, highly legible
  "serif-text", // Spectral at text weights
]);

export const monoFontTag = z.enum(["mono-data"]); // IBM Plex Mono

export type DisplayFontTag = z.infer<typeof displayFontTag>;
export type BodyFontTag = z.infer<typeof bodyFontTag>;
export type MonoFontTag = z.infer<typeof monoFontTag>;
export type FontTag = DisplayFontTag | BodyFontTag | MonoFontTag;

export type FontEntry = {
  /** CSS family name declared in @font-face. */
  family: string;
  /** Weights we actually ship. Asking for one not listed gets a synthesised face. */
  weights: number[];
  /** Files under services/templates/public/fonts, relative. */
  files: Array<{ weight: number; file: string; style?: "normal" | "italic" }>;
  /** Full stack including fallbacks, for the CSS variable. */
  stack: string;
};

const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';
const SANS_FALLBACK = "ui-sans-serif, system-ui, sans-serif";
const MONO_FALLBACK = 'ui-monospace, "Cascadia Mono", monospace';

export const FONT_REGISTRY: Record<FontTag, FontEntry> = {
  "serif-editorial": {
    family: "Spectral",
    weights: [500, 600],
    files: [
      { weight: 500, file: "spectral-500.woff2" },
      { weight: 600, file: "spectral-600.woff2" },
    ],
    stack: `Spectral, ${SERIF_FALLBACK}`,
  },
  "serif-bold-display": {
    family: "Fraunces",
    weights: [600, 900],
    files: [
      { weight: 600, file: "fraunces-600.woff2" },
      { weight: 900, file: "fraunces-900.woff2" },
    ],
    stack: `Fraunces, ${SERIF_FALLBACK}`,
  },
  "slab-display": {
    family: "Roboto Slab",
    weights: [600, 800],
    files: [
      { weight: 600, file: "roboto-slab-600.woff2" },
      { weight: 800, file: "roboto-slab-800.woff2" },
    ],
    stack: `"Roboto Slab", ${SERIF_FALLBACK}`,
  },
  "sans-geometric-display": {
    family: "Outfit",
    weights: [600, 800],
    files: [
      { weight: 600, file: "outfit-600.woff2" },
      { weight: 800, file: "outfit-800.woff2" },
    ],
    stack: `Outfit, ${SANS_FALLBACK}`,
  },
  "condensed-display": {
    family: "Archivo Narrow",
    weights: [600, 700],
    files: [
      { weight: 600, file: "archivo-narrow-600.woff2" },
      { weight: 700, file: "archivo-narrow-700.woff2" },
    ],
    stack: `"Archivo Narrow", ${SANS_FALLBACK}`,
  },
  "sans-grotesque": {
    family: "IBM Plex Sans",
    weights: [400, 500, 600],
    files: [
      { weight: 400, file: "plex-sans-400.woff2" },
      { weight: 500, file: "plex-sans-500.woff2" },
      { weight: 600, file: "plex-sans-600.woff2" },
    ],
    stack: `"IBM Plex Sans", ${SANS_FALLBACK}`,
  },
  "sans-neutral": {
    family: "Inter",
    weights: [400, 600],
    files: [
      { weight: 400, file: "inter-400.woff2" },
      { weight: 600, file: "inter-600.woff2" },
    ],
    stack: `Inter, ${SANS_FALLBACK}`,
  },
  "serif-text": {
    family: "Spectral",
    weights: [400, 500],
    files: [
      { weight: 400, file: "spectral-400.woff2" },
      { weight: 500, file: "spectral-500.woff2" },
    ],
    stack: `Spectral, ${SERIF_FALLBACK}`,
  },
  "mono-data": {
    family: "IBM Plex Mono",
    weights: [400],
    files: [{ weight: 400, file: "plex-mono-400.woff2" }],
    stack: `"IBM Plex Mono", ${MONO_FALLBACK}`,
  },

  /* ------------------------------------------------------- poster faces */
  /* All ship a single weight by design: a display face at 400 is already as
     heavy as it gets, and asking for 700 would synthesise a smeared fake. */

  "slab-poster": {
    family: "Alfa Slab One",
    weights: [400],
    files: [{ weight: 400, file: "alfa-slab-one-400.woff2" }],
    stack: `"Alfa Slab One", ${SERIF_FALLBACK}`,
  },
  "sans-condensed-heavy": {
    family: "Anton",
    weights: [400],
    files: [{ weight: 400, file: "anton-400.woff2" }],
    stack: `Anton, ${SANS_FALLBACK}`,
  },
  "sans-black": {
    family: "Archivo Black",
    weights: [400],
    files: [{ weight: 400, file: "archivo-black-400.woff2" }],
    stack: `"Archivo Black", ${SANS_FALLBACK}`,
  },
  "caps-tall": {
    family: "Bebas Neue",
    weights: [400],
    files: [{ weight: 400, file: "bebas-neue-400.woff2" }],
    stack: `"Bebas Neue", ${SANS_FALLBACK}`,
  },
  "caps-display": {
    family: "Staatliches",
    weights: [400],
    files: [{ weight: 400, file: "staatliches-400.woff2" }],
    stack: `Staatliches, ${SANS_FALLBACK}`,
  },
};

/**
 * Pairings that are known to work, offered in the UI so a person picking a
 * brand by eye does not have to reason about type. The first is the product's
 * own voice and is what NCA seeds with.
 */
export const CURATED_PAIRS: Array<{
  id: string;
  label: string;
  display: DisplayFontTag;
  body: BodyFontTag;
}> = [
  { id: "bulletin", label: "Bulletin", display: "serif-editorial", body: "sans-grotesque" },
  { id: "editorial", label: "Editorial", display: "serif-bold-display", body: "sans-neutral" },
  { id: "broadsheet", label: "Broadsheet", display: "serif-bold-display", body: "serif-text" },
  { id: "civic", label: "Civic", display: "slab-display", body: "sans-neutral" },
  { id: "modern", label: "Modern", display: "sans-geometric-display", body: "sans-neutral" },
  { id: "poster", label: "Poster", display: "condensed-display", body: "sans-grotesque" },
  { id: "quiet", label: "Quiet", display: "serif-editorial", body: "sans-neutral" },
  { id: "plain", label: "Plain", display: "sans-geometric-display", body: "sans-grotesque" },
  // Poster pairings: a heavy display face over a quiet body face, which is how
  // an event poster is normally set. The display face does all the shouting.
  { id: "poster", label: "Poster", display: "slab-poster", body: "sans-neutral" },
  { id: "impact", label: "Impact", display: "sans-condensed-heavy", body: "sans-neutral" },
  { id: "banner", label: "Banner", display: "sans-black", body: "sans-grotesque" },
  { id: "marquee", label: "Marquee", display: "caps-tall", body: "sans-neutral" },
  { id: "stencil", label: "Stencil", display: "caps-display", body: "sans-grotesque" },
];

/** All files that must exist in public/fonts for the registry to be honest. */
export function requiredFontFiles(): string[] {
  const seen = new Set<string>();
  for (const entry of Object.values(FONT_REGISTRY)) {
    for (const f of entry.files) seen.add(f.file);
  }
  return [...seen].sort();
}
