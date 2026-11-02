import { describe, expect, it } from "vitest";
import {
  brandCssBlock,
  brandCssVars,
  brandFontFaces,
  brandTokens,
  CURATED_PAIRS,
  FONT_REGISTRY,
  displayFontTag,
  GOLD_BRAND,
  NCA_BRAND,
  requiredFontFiles,
} from "./index";

describe("NCA seed", () => {
  it("parses as a valid brand", () => {
    // The seed is already parsed at module load, so reaching here at all means
    // it validated. Assert the identity fields so a careless edit is caught.
    expect(NCA_BRAND.slug).toBe("nca");
    expect(NCA_BRAND.isDefault).toBe(true);
    expect(() => brandTokens.parse(NCA_BRAND.tokens)).not.toThrow();
  });

  it("uses the product's own typefaces", () => {
    expect(FONT_REGISTRY[NCA_BRAND.tokens.fonts.display].family).toBe("Spectral");
    expect(FONT_REGISTRY[NCA_BRAND.tokens.fonts.body].family).toBe("IBM Plex Sans");
  });
});

describe("token schema", () => {
  it("rejects a colour that is not six-digit hex", () => {
    const bad = structuredClone(NCA_BRAND.tokens);
    bad.colors.primary = "rgb(46, 74, 60)" as never;
    expect(() => brandTokens.parse(bad)).toThrow(/sRGB hex/);
  });

  it("rejects a three-digit hex shorthand", () => {
    const bad = structuredClone(NCA_BRAND.tokens);
    bad.colors.accent = "#B83" as never;
    expect(() => brandTokens.parse(bad)).toThrow();
  });

  it("rejects a motif outside the closed set", () => {
    const bad = structuredClone(NCA_BRAND.tokens) as Record<string, unknown>;
    bad.motifs = ["laser-beams"];
    expect(() => brandTokens.parse(bad)).toThrow();
  });

  it("rejects a font that is a family name rather than a tag", () => {
    const bad = structuredClone(NCA_BRAND.tokens) as Record<string, unknown>;
    bad.fonts = { display: "Helvetica Neue", body: "sans-grotesque" };
    expect(() => brandTokens.parse(bad)).toThrow();
  });

  it("rejects a radius without a unit", () => {
    const bad = structuredClone(NCA_BRAND.tokens);
    bad.radii.card = "12" as never;
    expect(() => brandTokens.parse(bad)).toThrow(/px or rem/);
  });

  it("caps motifs so a poster cannot be a collage of everything", () => {
    const bad = structuredClone(NCA_BRAND.tokens) as Record<string, unknown>;
    bad.motifs = ["grain", "torn-paper", "tape-strips", "starfield", "halftone-dots"];
    expect(() => brandTokens.parse(bad)).toThrow();
  });
});

describe("css generation", () => {
  it("emits every colour token as a custom property", () => {
    const vars = brandCssVars(NCA_BRAND.tokens);
    expect(vars["--brand-primary"]).toBe("#2E4A3C");
    expect(vars["--brand-accent"]).toBe("#B08532");
    expect(vars["--brand-ink"]).toBe("#1B2430");
    expect(vars["--brand-font-display"]).toContain("Spectral");
  });

  it("omits the mono variable when a brand does not set one", () => {
    const withoutMono = structuredClone(NCA_BRAND.tokens);
    delete (withoutMono.fonts as { mono?: unknown }).mono;
    expect(brandCssVars(withoutMono)["--brand-font-mono"]).toBeUndefined();
  });

  it("is deterministic, because two renders must be byte-identical", () => {
    expect(brandCssBlock(NCA_BRAND.tokens)).toBe(brandCssBlock(NCA_BRAND.tokens));
  });

  it("declares font-display: block so a screenshot cannot catch a fallback face", () => {
    const faces = brandFontFaces(NCA_BRAND.tokens);
    expect(faces).toContain("font-display: block");
    expect(faces).not.toContain("font-display: swap");
  });

  it("only declares faces the brand actually uses", () => {
    const faces = brandFontFaces(NCA_BRAND.tokens);
    expect(faces).toContain("Spectral");
    expect(faces).toContain("IBM Plex Sans");
    expect(faces).not.toContain("Fraunces");
  });
});

describe("font registry", () => {
  it("every curated pair resolves to a registered face", () => {
    for (const pair of CURATED_PAIRS) {
      expect(FONT_REGISTRY[pair.display], pair.id).toBeDefined();
      expect(FONT_REGISTRY[pair.body], pair.id).toBeDefined();
    }
  });

  it("every declared weight has a file behind it", () => {
    for (const [tag, entry] of Object.entries(FONT_REGISTRY)) {
      const fileWeights = entry.files.map((f) => f.weight).sort();
      expect(entry.weights.slice().sort(), tag).toEqual(fileWeights);
    }
  });

  it("lists the files Task 3 has to put in public/fonts", () => {
    const files = requiredFontFiles();
    expect(files.every((f) => f.endsWith(".woff2"))).toBe(true);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe("poster display faces", () => {
  // The poster faces were added so a brand can set the heavy letterpress type
  // the reference posters use. A tag the registry does not know is a brand that
  // renders in a fallback face, which a screenshot cannot tell you about.
  it("every display tag resolves to a registered face", () => {
    for (const tag of displayFontTag.options) {
      expect(FONT_REGISTRY[tag], tag).toBeDefined();
    }
  });

  it("ships the faces the gold register depends on", () => {
    expect(FONT_REGISTRY["slab-poster"].family).toBe("Alfa Slab One");
    expect(FONT_REGISTRY["sans-condensed-heavy"].family).toBe("Anton");
    expect(FONT_REGISTRY["sans-black"].family).toBe("Archivo Black");
    expect(FONT_REGISTRY["caps-tall"].family).toBe("Bebas Neue");
    expect(FONT_REGISTRY["caps-display"].family).toBe("Staatliches");
  });
});

describe("gold seed", () => {
  it("parses as a valid brand and is not the default", () => {
    expect(GOLD_BRAND.slug).toBe("nca-gold");
    expect(GOLD_BRAND.isDefault).toBe(false);
    expect(() => brandTokens.parse(GOLD_BRAND.tokens)).not.toThrow();
  });

  it("asks for grain, which is what makes the gold read as printed", () => {
    expect(GOLD_BRAND.tokens.motifs).toContain("grain");
    expect(GOLD_BRAND.tokens.fonts.display).toBe("slab-poster");
  });
});
