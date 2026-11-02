import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { requiredFontFiles, SEED_TEMPLATES } from "@nca/brand-tokens";
import { REGISTRY, lookupTemplate, listTemplates } from "./registry";

const FONT_DIR = path.resolve(__dirname, "../public/fonts");

describe("font files", () => {
  /**
   * The registry is a promise that a face exists. If a file is missing the
   * browser silently synthesises one, and the poster ships in the wrong weight
   * with nothing anywhere reporting a problem.
   */
  it("every face the registry names is actually on disk", () => {
    const missing = requiredFontFiles().filter(
      (file) => !existsSync(path.join(FONT_DIR, file))
    );
    expect(missing, `run: npm run fonts:fetch`).toEqual([]);
  });
});

describe("template registry", () => {
  it("every registered template is also seeded into the database", () => {
    const seeded = new Set(SEED_TEMPLATES.map((t) => `${t.id}@${t.version}`));
    for (const meta of listTemplates()) {
      expect(seeded, `${meta.id}@${meta.version} is not in SEED_TEMPLATES`).toContain(
        `${meta.id}@${meta.version}`
      );
    }
  });

  it("keys itself by the meta it holds, so a lookup cannot return the wrong layout", () => {
    for (const [id, versions] of Object.entries(REGISTRY)) {
      for (const [version, entry] of Object.entries(versions)) {
        expect(entry.meta.id).toBe(id);
        expect(entry.meta.version).toBe(version);
      }
    }
  });

  it("defaults to v1 and returns null for anything unknown", () => {
    expect(lookupTemplate("quote-card")).not.toBeNull();
    expect(lookupTemplate("quote-card", "v99")).toBeNull();
    expect(lookupTemplate("no-such-template")).toBeNull();
  });
});
