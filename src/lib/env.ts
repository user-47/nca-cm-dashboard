import { z } from "zod";

/**
 * Server-side configuration. Read once at module load so a misconfigured
 * install fails at boot with a readable message rather than at 2am mid-render.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set"),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),

  // Shared HMAC secret for every app <-> n8n call, in both directions.
  PIPELINE_SECRET: z
    .string()
    .min(32, "PIPELINE_SECRET must be at least 32 characters"),

  // Where n8n should send its callbacks. Must be reachable from the n8n
  // container, so inside docker-compose this is http://app:3000, not localhost.
  APP_URL: z.string().url().default("http://localhost:3000"),

  // The address people actually type. Separate from APP_URL because that one
  // is a container hostname. Used to decide whether the session cookie can be
  // marked Secure: a Secure cookie sent over plain HTTP is dropped by the
  // browser, which would leave a church on a LAN unable to sign in at all.
  PUBLIC_URL: z.string().url().optional(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),

  N8N_BASE_URL: z.string().url().default("http://localhost:5678"),

  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("nca-media"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  // MinIO needs path-style addressing; real S3 does not.
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  // Browsers reach MinIO on a different host than the app container does.
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),

  // Poster rendering. Called server-side only, so render-api never needs to be
  // reachable from a browser.
  RENDER_API_URL: z.string().url().default("http://render-api:3000"),
  // The preview iframe is loaded by the browser, so this is a host address.
  NEXT_PUBLIC_TEMPLATES_URL: z.string().url().default("http://localhost:3100"),
});

function load() {
  // docker compose substitutes an unset variable as an empty string, not as an
  // absent one, so `FOO: ${FOO:-}` arrives here as "". Treat that as absent, or
  // every optional setting has to defend against it individually.
  const present = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== "")
  );

  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      `Configuration is incomplete. Check your .env file.\n${lines.join("\n")}`
    );
  }
  return parsed.data;
}

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) cached = load();
  return cached;
}
