import { z } from "zod";

/**
 * Read once at boot so a misconfigured container fails immediately with a
 * readable message, rather than at 2am on the first render of the day.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set"),

  /** Where the templates app lives, on the compose network. */
  TEMPLATES_URL: z.string().url().default("http://templates:3000"),

  PLAYWRIGHT_POOL_SIZE: z.coerce.number().int().min(1).max(16).default(3),
  /** A context is discarded after this many pages, to bound memory drift. */
  PLAYWRIGHT_CONTEXT_MAX_USES: z.coerce.number().int().min(1).default(50),
  /** Hard ceiling on one screenshot, including navigation and font loading. */
  RENDER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),

  S3_ENDPOINT: z.string().url().default("http://minio:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("nca-media"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  /** The host a browser can reach MinIO on, for the URLs handed back. */
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),

  RENDER_MINIO_PREFIX: z.string().default("posters/"),
  REFERENCE_MINIO_PREFIX: z.string().default("refs/"),

  /**
   * Style extraction. Absent is a valid state: the rest of render-api works
   * without it and /extract-style reports that it is unconfigured.
   */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4.7"),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;

  // docker compose substitutes an unset variable as "", not as absent.
  const present = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== "")
  );

  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`render-api is misconfigured.\n${lines.join("\n")}`);
  }

  cached = parsed.data;
  return cached;
}
