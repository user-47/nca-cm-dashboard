import { templateMeta, type TemplateMeta } from "../template-meta";

/**
 * The three MVP templates, declared once.
 *
 * Task 4 gives each of these a React component. Until then these objects are
 * the whole truth: the seed writes them to the `templates` table, and the
 * dashboard builds its form from the `slots`.
 */

export const QUOTE_CARD: TemplateMeta = templateMeta.parse({
  id: "quote-card",
  version: "v1",
  name: "Quote card",
  description: "An editorial quote with optional attribution and background image.",
  supportedRatios: ["1:1", "4:5", "9:16", "custom"],
  slots: [
    {
      id: "quote",
      label: "Quote",
      type: "textarea",
      required: true,
      max: 180,
      placeholder: "The Lord is my shepherd, I shall not want.",
      hint: "Shorter reads better. Around 90 characters fills the frame well.",
    },
    {
      id: "attribution",
      label: "Attribution",
      type: "text",
      required: false,
      max: 60,
      placeholder: "Psalm 23:1",
    },
    {
      id: "hero",
      label: "Background image",
      type: "image",
      required: false,
      hint: "Optional. Without one the quote sits on the brand colour.",
    },
  ],
});

export const ANNOUNCEMENT: TemplateMeta = templateMeta.parse({
  id: "announcement",
  version: "v1",
  name: "Announcement",
  description: "A photo with a title lockup, date, and location.",
  supportedRatios: ["1:1", "4:5", "9:16", "custom"],
  slots: [
    {
      id: "eyebrow",
      label: "Eyebrow",
      type: "text",
      required: false,
      max: 40,
      placeholder: "Sunday service",
    },
    {
      id: "title",
      label: "Title",
      type: "text",
      required: true,
      max: 70,
      placeholder: "Annual family barbecue",
    },
    { id: "date", label: "Date", type: "date", required: true },
    {
      id: "location",
      label: "Location",
      type: "text",
      required: false,
      max: 60,
      placeholder: "Riverside Park, Shelter 3",
    },
    { id: "hero", label: "Photo", type: "image", required: true },
    {
      id: "cta",
      label: "Call to action",
      type: "text",
      required: false,
      max: 40,
      placeholder: "Sign up at the welcome desk",
    },
  ],
});

export const SERMON_SERIES: TemplateMeta = templateMeta.parse({
  id: "sermon-series",
  version: "v1",
  name: "Sermon series",
  description: "A cinematic series title with part number and speaker.",
  supportedRatios: ["1:1", "4:5", "9:16", "16:9", "custom"],
  slots: [
    {
      id: "seriesTitle",
      label: "Series title",
      type: "text",
      required: true,
      max: 50,
      placeholder: "Living Water",
    },
    {
      id: "part",
      label: "Part",
      type: "text",
      required: false,
      max: 20,
      placeholder: "Part 3 of 5",
    },
    {
      id: "speaker",
      label: "Speaker",
      type: "text",
      required: false,
      max: 50,
      placeholder: "Pastor Daniel Osei",
    },
    { id: "date", label: "Date", type: "date", required: false },
    { id: "hero", label: "Background image", type: "image", required: true },
    {
      id: "portrait",
      label: "Speaker cutout",
      type: "cutout",
      required: false,
      hint: "A photo with the background removed. It stands at the right of the frame.",
    },
  ],
});

export const SEED_TEMPLATES: TemplateMeta[] = [QUOTE_CARD, ANNOUNCEMENT, SERMON_SERIES];
