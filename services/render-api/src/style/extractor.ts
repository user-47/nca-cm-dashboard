import Anthropic from "@anthropic-ai/sdk";
import {
  bodyFontTag,
  brandTokens,
  CURATED_PAIRS,
  displayFontTag,
  monoFontTag,
  motif,
  type BrandTokens,
} from "@nca/brand-tokens";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { ApiError } from "../lib/errors";

/**
 * Reads a brand out of a poster image.
 *
 * The shape of the answer is enforced by the API's structured outputs rather
 * than by asking nicely in the prompt and hoping. That matters here: the result
 * becomes CSS custom properties, so "mostly valid JSON" is not good enough, and
 * the older pattern of prompting for strict JSON and then parsing-and-retrying
 * is exactly what this replaces.
 *
 * Two layers of validation, deliberately:
 *   1. The API constrains the response to the schema, so enums (motifs, font
 *      tags) cannot come back as something a template has no way to draw.
 *   2. Structured outputs do not support string patterns, so the hex-colour
 *      regex in brandTokens is stripped from the schema the API sees. It still
 *      runs here, client-side, which is what catches a plausible-looking
 *      "rgb(46,74,60)".
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export function isSupportedImageType(value: string): value is AllowedMediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * The JSON Schema the API constrains the answer to.
 *
 * Hand-written rather than generated from the Zod schema, for two reasons.
 * The SDK's zod helper targets Zod 4 and this workspace is on Zod 3, and
 * structured outputs reject the pattern and length constraints brandTokens
 * carries — so a generated schema would have to be stripped anyway. Writing it
 * out keeps what the model is told exactly in step with what it can satisfy.
 *
 * Enum members are read from the Zod enums so a new motif or font tag cannot
 * be added to the design system and silently go unoffered here.
 */
const hex = { type: "string" as const, description: "sRGB hex, e.g. #2E4A3C" };

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["colors", "fonts", "radii", "motifs", "mood"],
  properties: {
    colors: {
      type: "object",
      additionalProperties: false,
      required: [
        "primary",
        "onPrimary",
        "accent",
        "surface",
        "surfaceAlt",
        "ink",
        "inkMuted",
      ],
      properties: {
        primary: hex,
        onPrimary: hex,
        accent: hex,
        surface: hex,
        surfaceAlt: hex,
        ink: hex,
        inkMuted: hex,
      },
    },
    fonts: {
      type: "object",
      additionalProperties: false,
      required: ["display", "body"],
      properties: {
        display: { type: "string", enum: [...displayFontTag.options] },
        body: { type: "string", enum: [...bodyFontTag.options] },
        mono: { type: "string", enum: [...monoFontTag.options] },
      },
    },
    radii: {
      type: "object",
      additionalProperties: false,
      required: ["card", "pill"],
      properties: {
        card: { type: "string", description: "px or rem, e.g. 12px" },
        pill: { type: "string", description: "px or rem, e.g. 999px" },
      },
    },
    motifs: {
      type: "array",
      items: { type: "string", enum: [...motif.options] },
      description: "Only treatments actually visible. Four at most; often none.",
    },
    mood: { type: "string", description: "A short phrase, at most 80 characters." },
    notes: { type: "string", description: "One or two sentences for a person to read." },
  },
} as const;

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!config().ANTHROPIC_API_KEY) {
    throw new ApiError(
      501,
      "EXTRACTION_UNAVAILABLE",
      "Reading a brand from a poster needs an Anthropic API key. Add ANTHROPIC_API_KEY and restart."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: config().ANTHROPIC_API_KEY });
  }
  return client;
}

const PAIR_GUIDE = CURATED_PAIRS.map(
  (p) => `  ${p.display} + ${p.body} — ${p.label}`
).join("\n");

const SYSTEM = `You read a poster image and describe the design system behind it, so the same look can be rebuilt from tokens.

Colours
Sample from the dominant regions of the artwork, not from stray pixels or compression noise. Report sRGB hex only.
- primary is the colour the poster is built on: large fills, blocks, bands.
- onPrimary is text placed on top of primary. It must stay legible on it.
- accent is the single highlight. Pick the colour used sparingly for emphasis, not the second-most-common colour.
- surface is the page background; surfaceAlt is a near neighbour for cards laid over it.
- ink is body text on surface; inkMuted is secondary text, clearly lighter than ink but still readable.
If the poster is photographic and has no flat colour fields, infer the palette its type and furniture imply rather than averaging the photograph.

Type
Name the closest pairing from this list. These are tags, not font names: never answer with a font family.
${PAIR_GUIDE}

Motifs
Only decorative treatments actually visible in the image. Choose none rather than guessing; four is the maximum and most posters have zero or one.

mood is a short phrase a designer would recognise, such as "quiet print, warm and unhurried".
notes is one or two sentences on how you read the poster. It is shown to a person and never affects the render.`;

export type ExtractionResult = {
  tokens: BrandTokens;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export async function extractStyle(
  image: Buffer,
  mediaType: AllowedMediaType
): Promise<ExtractionResult> {
  if (image.length > MAX_IMAGE_BYTES) {
    throw new ApiError(
      413,
      "IMAGE_TOO_LARGE",
      "That image is over 8 MB. Save it smaller and try again."
    );
  }

  const started = Date.now();

  const request = {
    model: config().ANTHROPIC_MODEL,
    // Thinking is on by default on this model and shares the budget with the
    // response, so this is generous rather than tight.
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      format: { type: "json_schema" as const, schema: OUTPUT_SCHEMA },
    },
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: mediaType,
              data: image.toString("base64"),
            },
          },
          {
            type: "text" as const,
            text: "Describe the design system behind this poster.",
          },
        ],
      },
    ],
  };

  let message;
  try {
    message = await anthropic().messages.create(request);
  } catch (cause) {
    throw translate(cause);
  }

  // A safety classifier can decline, and that arrives as a normal 200 with an
  // empty content array. Reading content[0] first would throw something
  // unhelpful instead of saying what happened.
  if (message.stop_reason === "refusal") {
    throw new ApiError(
      422,
      "EXTRACTION_REFUSED",
      "That image could not be analysed. Try a different poster."
    );
  }

  const raw = message.content.find((block) => block.type === "text");
  if (!raw || raw.type !== "text") {
    throw new ApiError(
      502,
      "EXTRACTION_EMPTY",
      "The style reader returned nothing. Try again."
    );
  }

  const parsed = parseTokens(raw.text);
  if (!parsed.ok) {
    logger.warn({ issues: parsed.issues }, "extraction failed client validation");
    throw new ApiError(
      422,
      "EXTRACTION_INVALID",
      "The colours read from that poster did not come back in a usable form. Try a different image.",
      parsed.issues
    );
  }

  logger.info(
    {
      model: message.model,
      ms: Date.now() - started,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      mood: parsed.tokens.mood,
    },
    "style extracted"
  );

  return {
    tokens: parsed.tokens,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
    model: message.model,
  };
}

function parseTokens(
  text: string
): { ok: true; tokens: BrandTokens } | { ok: false; issues: unknown } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, issues: "the response was not JSON" };
  }

  // The full schema, patterns included. Structured outputs guaranteed the
  // shape; this is what enforces the parts it cannot express.
  const result = brandTokens.safeParse(json);
  return result.success
    ? { ok: true, tokens: result.data }
    : { ok: false, issues: result.error.issues };
}

/** Turns SDK errors into something the dashboard can show a person. */
function translate(cause: unknown): ApiError {
  // Already ours — the missing-key case is raised while building the client,
  // inside the same try. Passing it through keeps its status and message
  // instead of flattening it to a generic failure.
  if (cause instanceof ApiError) return cause;

  if (cause instanceof Anthropic.AuthenticationError) {
    return new ApiError(
      502,
      "ANTHROPIC_AUTH",
      "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
    );
  }
  if (cause instanceof Anthropic.RateLimitError) {
    return new ApiError(
      429,
      "ANTHROPIC_RATE_LIMIT",
      "Too many posters analysed at once. Wait a moment and try again."
    );
  }
  if (cause instanceof Anthropic.BadRequestError) {
    return new ApiError(
      400,
      "ANTHROPIC_BAD_REQUEST",
      `The style reader rejected that request. ${cause.message}`
    );
  }
  if (cause instanceof Anthropic.APIConnectionError) {
    return new ApiError(
      502,
      "ANTHROPIC_UNREACHABLE",
      "The Anthropic API could not be reached. Check this machine's network access."
    );
  }
  if (cause instanceof Anthropic.APIError) {
    return new ApiError(
      502,
      "ANTHROPIC_ERROR",
      `The style reader failed (${cause.status}).`
    );
  }
  return new ApiError(
    500,
    "EXTRACTION_FAILED",
    "Reading that poster failed. Check the render-api log."
  );
}
