import { brandSeed, type BrandSeed } from "../schema";

/**
 * New Covenant Assembly, the first brand.
 *
 * The palette and type are the product's own, not a new invention: deep
 * evergreen and warm brass over a soft cool paper, set in Spectral and IBM Plex
 * Sans. Posters made here should look like they came from the same place as the
 * dashboard that made them.
 *
 * Roles differ from the app chrome, though. In the dashboard, brass is scarce
 * and marks the one primary action. On a poster there is no "action", so the
 * structural evergreen leads and brass becomes the single point of emphasis.
 */
export const NCA_BRAND: BrandSeed = brandSeed.parse({
  slug: "nca",
  name: "New Covenant Assembly",
  isDefault: true,
  logoUrl: null,
  tokens: {
    colors: {
      primary: "#2E4A3C", // forest: structural blocks, scrims, bands
      onPrimary: "#F3F1EA", // warm off-white, reads clean on forest
      accent: "#B08532", // brass: one emphasis per poster
      surface: "#ECEEE9", // the app's paper, a soft cool sage-grey
      surfaceAlt: "#FAFBF8", // cards and panels laid over surface
      ink: "#1B2430",
      inkMuted: "#5A6472",
    },
    fonts: {
      display: "serif-editorial", // Spectral
      body: "sans-grotesque", // IBM Plex Sans
      mono: "mono-data", // IBM Plex Mono, for dates and part numbers
    },
    radii: {
      card: "12px",
      pill: "999px",
    },
    motifs: ["paper-grain"],
    mood: "quiet print, warm and unhurried",
    notes:
      "Carries the dashboard's own palette so posters and the tool that makes them look related. Brass is the single emphasis, never a second one.",
  },
});

import { GOLD_BRAND } from "./gold";

/** Both registers of the identity: quiet print, and the loud event poster. */
export const SEED_BRANDS: BrandSeed[] = [NCA_BRAND, GOLD_BRAND];
