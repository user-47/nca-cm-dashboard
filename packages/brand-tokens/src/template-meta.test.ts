import { describe, expect, it } from "vitest";
import {
  ANNOUNCEMENT,
  isImageSlot,
  paramsSchemaFor,
  slotType,
  QUOTE_CARD,
  ratioFor,
  SEED_TEMPLATES,
  SERMON_SERIES,
  templateMeta,
} from "./index";

describe("seeded templates", () => {
  it("all parse as valid meta", () => {
    for (const meta of SEED_TEMPLATES) {
      expect(() => templateMeta.parse(meta), meta.id).not.toThrow();
    }
  });

  it("have unique ids", () => {
    const ids = SEED_TEMPLATES.map((t) => `${t.id}@${t.version}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all support the three MVP sizes", () => {
    for (const meta of SEED_TEMPLATES) {
      for (const ratio of ["1:1", "4:5", "9:16"] as const) {
        expect(meta.supportedRatios, meta.id).toContain(ratio);
      }
    }
  });

  it("declare slot ids in camelCase so they map to params keys", () => {
    for (const meta of SEED_TEMPLATES) {
      for (const slot of meta.slots) {
        expect(slot.id, `${meta.id}.${slot.id}`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });
});

describe("meta schema", () => {
  it("rejects a non-kebab-case template id", () => {
    expect(() => templateMeta.parse({ ...QUOTE_CARD, id: "QuoteCard" })).toThrow();
  });

  it("rejects a version that is not vN", () => {
    expect(() => templateMeta.parse({ ...QUOTE_CARD, version: "1.0" })).toThrow();
  });

  it("rejects a template with no slots, since the form would be empty", () => {
    expect(() => templateMeta.parse({ ...QUOTE_CARD, slots: [] })).toThrow();
  });
});

describe("paramsSchemaFor", () => {
  it("accepts a filled quote card", () => {
    const schema = paramsSchemaFor(QUOTE_CARD);
    expect(() =>
      schema.parse({ quote: "Be still, and know that I am God.", attribution: "Psalm 46:10" })
    ).not.toThrow();
  });

  it("requires the slots marked required", () => {
    const schema = paramsSchemaFor(QUOTE_CARD);
    expect(() => schema.parse({ attribution: "Psalm 46:10" })).toThrow();
  });

  it("treats a whitespace-only required field as missing", () => {
    const schema = paramsSchemaFor(QUOTE_CARD);
    expect(() => schema.parse({ quote: "   " })).toThrow(/Quote is needed/);
  });

  it("enforces the character cap the form shows", () => {
    const schema = paramsSchemaFor(QUOTE_CARD);
    expect(() => schema.parse({ quote: "x".repeat(181) })).toThrow(/180 characters/);
  });

  it("leaves optional slots optional", () => {
    const schema = paramsSchemaFor(QUOTE_CARD);
    expect(() => schema.parse({ quote: "Enough." })).not.toThrow();
  });

  it("requires image slots to be URLs", () => {
    const schema = paramsSchemaFor(ANNOUNCEMENT);
    expect(() =>
      schema.parse({ title: "Barbecue", date: "2026-08-30", hero: "not-a-url" })
    ).toThrow(/URL/);
  });

  it("requires dates to be ISO", () => {
    const schema = paramsSchemaFor(ANNOUNCEMENT);
    expect(() =>
      schema.parse({
        title: "Barbecue",
        date: "30 August",
        hero: "https://example.test/a.png",
      })
    ).toThrow(/ISO date/);
  });

  it("accepts a complete sermon series", () => {
    const schema = paramsSchemaFor(SERMON_SERIES);
    expect(() =>
      schema.parse({
        seriesTitle: "Living Water",
        part: "Part 3 of 5",
        speaker: "Pastor Daniel Osei",
        date: "2026-09-06",
        hero: "https://example.test/hero.jpg",
      })
    ).not.toThrow();
  });
});

describe("ratioFor", () => {
  it("names the presets", () => {
    expect(ratioFor(1080, 1080)).toBe("1:1");
    expect(ratioFor(1080, 1350)).toBe("4:5");
    expect(ratioFor(1080, 1920)).toBe("9:16");
    expect(ratioFor(1280, 720)).toBe("16:9");
  });

  it("falls back to custom for anything else", () => {
    expect(ratioFor(1200, 630)).toBe("custom");
  });
});

describe("validation messages name the slot", () => {
  it("says which field is missing, not just 'Required'", () => {
    const schema = paramsSchemaFor(QUOTE_CARD);
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Quote is needed");
    }
  });

  it("names the slot when a required image is absent", () => {
    const schema = paramsSchemaFor(ANNOUNCEMENT);
    const result = schema.safeParse({ title: "Barbecue", date: "2026-08-30" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Photo"))).toBe(true);
    }
  });
});

describe("cutout slots", () => {
  // A cutout is a transparent PNG layered over the artwork. It validates exactly
  // like an image: an uploaded object key, or an absolute URL.
  it("is declared by sermon-series", () => {
    const slot = SERMON_SERIES.slots.find((s) => s.id === "portrait");
    expect(slot?.type).toBe("cutout");
    expect(slot?.required).toBe(false);
  });

  it("accepts an object key", () => {
    const schema = paramsSchemaFor(SERMON_SERIES);
    const result = schema.safeParse({
      seriesTitle: "Living Water",
      hero: "org/image/hero.png",
      portrait: "org/image/speaker.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an absolute URL", () => {
    const schema = paramsSchemaFor(SERMON_SERIES);
    const result = schema.safeParse({
      seriesTitle: "Living Water",
      hero: "org/image/hero.png",
      portrait: "https://example.org/speaker.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bare word and names the slot", () => {
    const schema = paramsSchemaFor(SERMON_SERIES);
    const result = schema.safeParse({
      seriesTitle: "Living Water",
      hero: "org/image/hero.png",
      portrait: "not-an-image",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Speaker cutout");
    }
  });

  it("stays optional, so a poster without one still validates", () => {
    const schema = paramsSchemaFor(SERMON_SERIES);
    const result = schema.safeParse({
      seriesTitle: "Living Water",
      hero: "org/image/hero.png",
    });
    expect(result.success).toBe(true);
  });
});

describe("isImageSlot", () => {
  /**
   * The invariant that broke: a slot type validated as an object key must also
   * be reported as an image slot, because the templates app uses that answer to
   * decide what to rewrite into its image route. When `cutout` validated as a
   * key but was not reported as one, the raw key reached the markup, the browser
   * resolved it against the render path, and the render hung until the paint
   * guard gave up 28 seconds later.
   *
   * Derived from the schema rather than hardcoded, so a new key-carrying slot
   * type fails here instead of in a timeout.
   */
  for (const type of slotType.options) {
    it(`agrees with the validator about ${type}`, () => {
      const meta = templateMeta.parse({
        id: "probe",
        version: "v1",
        name: "Probe",
        description: "One slot, to see how the validator treats it.",
        supportedRatios: ["1:1"],
        slots: [
          {
            id: "field",
            label: "Field",
            type,
            required: true,
            ...(type === "select" ? { options: [{ value: "a", label: "A" }] } : {}),
          },
        ],
      });
      const schema = paramsSchemaFor(meta);

      // An object key is accepted, and a bare word is not, exactly when the slot
      // carries a key rather than literal text.
      const takesKey = schema.safeParse({ field: "org/image/photo.png" }).success;
      const takesWord = schema.safeParse({ field: "hello" }).success;

      expect(isImageSlot(type), type).toBe(takesKey && !takesWord);
    });
  }

  it("covers image and cutout, and nothing else", () => {
    const imageish = slotType.options.filter(isImageSlot);
    expect(imageish.slice().sort()).toEqual(["cutout", "image"]);
  });
});
