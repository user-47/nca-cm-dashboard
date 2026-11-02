/**
 * Brand design tokens.
 *
 * A brand is a database row, not a code module. This package holds only the
 * shape of that row, the fonts it may reference, and the seed data, so the
 * dashboard, the templates app, and render-api all agree on what a brand is
 * without importing each other.
 *
 * Framework-free on purpose: it is consumed by a Next 14 app, a Next 15 app,
 * and a Fastify service, so nothing here may depend on React or Next.
 */

export {
  brand,
  brandSeed,
  brandTokens,
  brandColors,
  brandFonts,
  brandRadii,
  extractedTokens,
  hexColor,
  motif,
} from "./schema";

export type {
  Brand,
  BrandSeed,
  BrandTokens,
  BrandColors,
  BrandFonts,
  BrandRadii,
  ExtractedTokens,
  HexColor,
  Motif,
} from "./schema";

export {
  bodyFontTag,
  displayFontTag,
  monoFontTag,
  CURATED_PAIRS,
  FONT_REGISTRY,
  requiredFontFiles,
} from "./fonts";

export type {
  BodyFontTag,
  DisplayFontTag,
  FontEntry,
  FontTag,
  MonoFontTag,
} from "./fonts";

export { brandCssBlock, brandCssVars, brandFontFaces } from "./css";

export {
  aspectRatio,
  IMAGE_SLOT_TYPES,
  isImageSlot,
  paramsSchemaFor,
  ratioFor,
  slotType,
  templateMeta,
  templateSlot,
  RATIO_PRESETS,
} from "./template-meta";

export type {
  AspectRatio,
  SlotType,
  TemplateMeta,
  TemplateSlot,
} from "./template-meta";

export { NCA_BRAND, SEED_BRANDS } from "./seed/nca";
export { GOLD_BRAND } from "./seed/gold";
export {
  ANNOUNCEMENT,
  QUOTE_CARD,
  SERMON_SERIES,
  SEED_TEMPLATES,
} from "./seed/templates";
