import { FONT_REGISTRY } from "./fonts";
import type { BrandTokens } from "./schema";

/**
 * Turns a brand into CSS custom properties.
 *
 * The templates app injects the result into a <style> tag so every template can
 * be written against var(--brand-primary) and friends, never a literal colour.
 * That indirection is the whole reason a church can rebrand without a code
 * change.
 *
 * Output is deterministic: keys are emitted in a fixed order with no timestamp
 * or randomness, because two renders of the same poster must produce
 * byte-identical PNGs.
 */
export function brandCssVars(tokens: BrandTokens): Record<string, string> {
  const { colors, fonts, radii } = tokens;

  const vars: Record<string, string> = {
    "--brand-primary": colors.primary,
    "--brand-on-primary": colors.onPrimary,
    "--brand-accent": colors.accent,
    "--brand-surface": colors.surface,
    "--brand-surface-alt": colors.surfaceAlt,
    "--brand-ink": colors.ink,
    "--brand-ink-muted": colors.inkMuted,
    "--brand-radius-card": radii.card,
    "--brand-radius-pill": radii.pill,
    "--brand-font-display": FONT_REGISTRY[fonts.display].stack,
    "--brand-font-body": FONT_REGISTRY[fonts.body].stack,
  };

  if (fonts.mono) {
    vars["--brand-font-mono"] = FONT_REGISTRY[fonts.mono].stack;
  }

  return vars;
}

/** The same thing as a `:root { … }` block, ready to drop into a <style> tag. */
export function brandCssBlock(tokens: BrandTokens, selector = ":root"): string {
  const vars = brandCssVars(tokens);
  const body = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

/**
 * @font-face declarations for exactly the faces a brand uses, so a template
 * page never downloads a family it will not draw.
 *
 * font-display: block is deliberate. The usual advice is swap, which paints
 * fallback text first and reflows when the real face lands. In a screenshot
 * that is a race we would lose silently, shipping a poster in the wrong
 * typeface. Blocking means the text simply is not painted until the face is
 * ready, and render-api waits on document.fonts.ready before capturing.
 */
export function brandFontFaces(tokens: BrandTokens, basePath = "/fonts"): string {
  const tags = [tokens.fonts.display, tokens.fonts.body, tokens.fonts.mono].filter(
    (t): t is NonNullable<typeof t> => Boolean(t)
  );

  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const tag of tags) {
    const entry = FONT_REGISTRY[tag];
    for (const face of entry.files) {
      const key = `${entry.family}:${face.weight}:${face.style ?? "normal"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push(
        [
          "@font-face {",
          `  font-family: "${entry.family}";`,
          `  src: url("${basePath}/${face.file}") format("woff2");`,
          `  font-weight: ${face.weight};`,
          `  font-style: ${face.style ?? "normal"};`,
          "  font-display: block;",
          "}",
        ].join("\n")
      );
    }
  }

  return blocks.join("\n\n");
}
