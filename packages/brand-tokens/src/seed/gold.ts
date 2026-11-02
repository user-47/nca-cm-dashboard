import { brandSeed, type BrandSeed } from "../schema";

/**
 * A second brand in the textured-gold register.
 *
 * The New Covenant brand is quiet print: sage paper, evergreen, brass used once.
 * That is right for a bulletin and wrong for an event poster, which has to work
 * at a glance in a feed. This one is the opposite end of the same identity —
 * near-black ground, heavy letterpress slab, gold doing the shouting, grain over
 * everything — so a person can reach for the loud option without hand-editing
 * tokens or abandoning the church's colours.
 */
export const GOLD_BRAND: BrandSeed = brandSeed.parse({
  slug: "nca-gold",
  name: "New Covenant Gold",
  isDefault: false,
  logoUrl: null,
  tokens: {
    colors: {
      primary: "#0E1411", // near-black with a green cast, not a flat grey
      onPrimary: "#F4EFE2",
      accent: "#C9A227", // the shouting colour
      surface: "#0E1411",
      surfaceAlt: "#1A231D",
      ink: "#F4EFE2",
      inkMuted: "#A79E88",
    },
    fonts: {
      display: "slab-poster", // Alfa Slab One
      body: "sans-neutral", // Inter
      mono: "mono-data",
    },
    radii: {
      card: "6px",
      pill: "999px",
    },
    // Grain is what makes the gold read as printed rather than filled, and it
    // is drawn into the letterforms as well as over the artwork.
    motifs: ["grain"],
    mood: "letterpress gold on near-black, loud and confident",
    notes:
      "The event-poster register of the New Covenant identity. Reach for it when a poster has to carry across a feed rather than sit on a notice sheet.",
  },
});
