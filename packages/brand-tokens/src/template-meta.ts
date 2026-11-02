import { z } from "zod";

/**
 * What a template declares about itself.
 *
 * The dashboard builds the poster form from `slots` — one input per slot — so
 * adding a template never means writing a form. That is the whole point: a
 * template is data plus a React component, and the UI adapts.
 *
 * Task 4 puts a `meta.ts` in each template folder that satisfies this schema,
 * and the seed registers the same objects as rows. One shape, two consumers.
 */

export const aspectRatio = z.enum(["1:1", "4:5", "9:16", "16:9", "custom"]);
export type AspectRatio = z.infer<typeof aspectRatio>;

/**
 * `cutout` is an image with a transparent background, which templates float as
 * a layer over the artwork rather than using as a backdrop. It validates
 * exactly like `image`; the distinction is what a template does with it.
 */
export const slotType = z.enum([
  "text",
  "textarea",
  "image",
  "cutout",
  "date",
  "select",
]);

/**
 * The slot types that carry a MinIO object key rather than literal text.
 *
 * Declared once because three places have to agree on it: this file validates
 * them, the templates app rewrites them into its own image route before
 * rendering, and the dashboard shows them as a file picker. When `cutout` was
 * added and only two of the three learned about it, the key reached the markup
 * unrewritten, the browser resolved it against the render path, and the poster
 * hung until the paint guard gave up.
 */
export const IMAGE_SLOT_TYPES = ["image", "cutout"] as const;

export function isImageSlot(type: SlotType): boolean {
  return (IMAGE_SLOT_TYPES as readonly string[]).includes(type);
}
export type SlotType = z.infer<typeof slotType>;

export const templateSlot = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/, "Slot ids are camelCase, starting with a letter"),
  label: z.string().min(1).max(40),
  type: slotType,
  required: z.boolean().default(false),
  /** Character cap for text and textarea. Enforced in the form and at render. */
  max: z.number().int().positive().optional(),
  /** Shown in the empty input. Should read like real content, not "Enter text". */
  placeholder: z.string().max(120).optional(),
  /** Only for select. */
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  /** Short guidance under the input, when the label is not enough on its own. */
  hint: z.string().max(160).optional(),
});

export type TemplateSlot = z.infer<typeof templateSlot>;

export const templateMeta = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Template ids are kebab-case"),
  version: z.string().regex(/^v\d+$/, "Versions look like v1"),
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  supportedRatios: z.array(aspectRatio).min(1),
  slots: z.array(templateSlot).min(1),
});

export type TemplateMeta = z.infer<typeof templateMeta>;

/**
 * Builds the Zod validator for one template's params from its slots, so the
 * render path rejects bad input using the same declaration the form was built
 * from. A template cannot drift from its own contract.
 */
export function paramsSchemaFor(meta: TemplateMeta) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const slot of meta.slots) {
    let field: z.ZodTypeAny;

    /**
     * Naming the slot in both messages matters. Zod's defaults are "Required"
     * and "Expected string, received number", which tell whoever is filling the
     * form nothing about which box to go back to.
     */
    const messages = {
      required_error: `${slot.label} is needed`,
      invalid_type_error: `${slot.label} needs to be text`,
    };

    switch (slot.type) {
      case "text":
      case "textarea": {
        let s = z.string(messages);
        if (slot.max) s = s.max(slot.max, `${slot.label} is limited to ${slot.max} characters`);
        // A required text slot must carry actual content, not just spaces.
        field = slot.required ? s.trim().min(1, `${slot.label} is needed`) : s;
        break;
      }
      case "image":
      case "cutout":
        /**
         * Either a MinIO object key or an absolute URL.
         *
         * A key is the portable form and what the dashboard stores: the
         * templates app resolves it through its own image route, which works
         * identically for the browser showing the preview and for the headless
         * browser taking the screenshot. A presigned URL cannot do that,
         * because it is signed for the host a browser uses and the renderer
         * sits on a different network.
         *
         * Absolute URLs are still accepted so an externally hosted image works.
         */
        field = z
          .string(messages)
          .refine(
            (v) => /^https?:\/\//.test(v) || /^[\w-]+(\/[\w.\-]+)+$/.test(v),
            `${slot.label} needs to be an uploaded image or a URL`
          );
        break;
      case "date":
        // ISO date. Kept as a string so a render is not sensitive to timezone
        // handling on whichever machine happens to run it.
        field = z
          .string(messages)
          .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, `${slot.label} needs to be an ISO date`);
        break;
      case "select": {
        const values = (slot.options ?? []).map((o) => o.value);
        field =
          values.length > 0
            ? z.enum(values as [string, ...string[]], {
                required_error: messages.required_error,
                invalid_type_error: `${slot.label} is not one of the allowed choices`,
              })
            : z.string(messages);
        break;
      }
    }

    shape[slot.id] = slot.required ? field : field.optional();
  }

  return z.object(shape);
}

/** The dimensions a ratio implies at Instagram's short edge. */
export const RATIO_PRESETS: Record<Exclude<AspectRatio, "custom">, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1280, height: 720 },
};

/** Which ratio a width and height correspond to, or "custom". */
export function ratioFor(width: number, height: number): AspectRatio {
  for (const [ratio, size] of Object.entries(RATIO_PRESETS)) {
    if (size.width === width && size.height === height) return ratio as AspectRatio;
  }
  return "custom";
}
