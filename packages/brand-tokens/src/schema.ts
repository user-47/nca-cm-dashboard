import { z } from "zod";
import { bodyFontTag, displayFontTag, monoFontTag } from "./fonts";

/**
 * The shape of a brand.
 *
 * This is the contract between three places: the dashboard writes it, the
 * templates app reads it and turns it into CSS custom properties, and the
 * style extractor produces a candidate version of it from a reference image.
 * Anything a template needs to look right has to be expressible here, because
 * a template may not reach for a value that is not a token.
 */

/** sRGB hex only. The extractor is told this too, so both ends agree. */
export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit sRGB hex colour, such as #2E4A3C");

export const brandColors = z.object({
  /** The dominant brand colour. Large fills, structural blocks. */
  primary: hexColor,
  /** Text and marks placed on top of primary. Must clear contrast on it. */
  onPrimary: hexColor,
  /** The highlight. Used sparingly: one emphasis per poster. */
  accent: hexColor,
  /** Page background. */
  surface: hexColor,
  /** A second background for cards and bands laid over surface. */
  surfaceAlt: hexColor,
  /** Body and heading text on surface. */
  ink: hexColor,
  /** Secondary text: captions, metadata, attribution. */
  inkMuted: hexColor,
});

export const brandFonts = z.object({
  display: displayFontTag,
  body: bodyFontTag,
  /** Dates, part numbers, anything that should read as data. */
  mono: monoFontTag.optional(),
});

export const brandRadii = z.object({
  card: z.string().regex(/^\d+(px|rem)$/, "Use a px or rem value, such as 18px"),
  pill: z.string().regex(/^\d+(px|rem)$/, "Use a px or rem value, such as 999px"),
});

/**
 * Closed set. A motif is a decorative treatment a template may opt into; the
 * extractor may only choose from these, so an unrecognised suggestion can
 * never reach a template that has no way to draw it.
 */
export const motif = z.enum([
  "torn-paper",
  "halftone-dots",
  "sticker-text",
  "grain",
  "tape-strips",
  "hand-scribble",
  "starfield",
  "mesh-gradient",
  "paper-grain",
  "cross-etch",
  "geometric-blocks",
  "spray-splatter",
]);

export const brandTokens = z.object({
  colors: brandColors,
  fonts: brandFonts,
  radii: brandRadii,
  motifs: z.array(motif).max(4).default([]),
  /** A short phrase describing the feel. Shown in the UI, not used for layout. */
  mood: z.string().min(1).max(80),
  /** Free text from the extractor explaining its reading. Never affects render. */
  notes: z.string().max(600).optional(),
});

export type HexColor = z.infer<typeof hexColor>;
export type BrandColors = z.infer<typeof brandColors>;
export type BrandFonts = z.infer<typeof brandFonts>;
export type BrandRadii = z.infer<typeof brandRadii>;
export type Motif = z.infer<typeof motif>;
export type BrandTokens = z.infer<typeof brandTokens>;

/** A full brand row as the dashboard and templates app see it. */
export const brand = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  name: z.string().min(1).max(80),
  tokens: brandTokens,
  logoUrl: z.string().url().nullable().default(null),
  isDefault: z.boolean().default(false),
});

export type Brand = z.infer<typeof brand>;

/** The tokens plus identity, before an id exists. What seeding inserts. */
export const brandSeed = brand.omit({ id: true, orgId: true });
export type BrandSeed = z.infer<typeof brandSeed>;

/**
 * What the style extractor is allowed to return. Deliberately a subset of
 * BrandTokens: it may not invent an id, a slug, or a logo, and the colours it
 * proposes still have to satisfy the same hex rule as a hand-authored brand.
 */
export const extractedTokens = brandTokens;
export type ExtractedTokens = z.infer<typeof extractedTokens>;
