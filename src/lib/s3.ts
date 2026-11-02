import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { env } from "./env";

/**
 * The app and n8n share one MinIO bucket. Large files never travel through a
 * webhook or through a Next route handler: the browser uploads straight to
 * MinIO with a presigned PUT, and pipelines read and write object keys.
 */

let client: S3Client | null = null;

function s3() {
  const e = env();
  if (!client) {
    client = new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: e.S3_ACCESS_KEY,
        secretAccessKey: e.S3_SECRET_KEY,
      },
    });
  }
  return client;
}

/**
 * A separate client bound to the endpoint a browser can actually reach. Inside
 * docker-compose the app talks to http://minio:9000 but the person's browser
 * has to use http://localhost:9000, and a URL signed for one host will not
 * validate against the other.
 */
let publicClient: S3Client | null = null;

function s3Public() {
  const e = env();
  if (!e.S3_PUBLIC_ENDPOINT) return s3();
  if (!publicClient) {
    publicClient = new S3Client({
      endpoint: e.S3_PUBLIC_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: e.S3_ACCESS_KEY,
        secretAccessKey: e.S3_SECRET_KEY,
      },
    });
  }
  return publicClient;
}

/** Namespaced object key: org/kind/uuid-filename. Keeps orgs separable. */
export function buildKey(orgId: string, kind: string, filename: string): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${orgId}/${kind}/${randomUUID()}-${safe || "file"}`;
}

export async function presignPut(
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  return getSignedUrl(
    s3Public(),
    new PutObjectCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3Public(),
    new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }),
    { expiresIn }
  );
}

/**
 * Signed URL for a pipeline container, not a browser. Uses the internal
 * endpoint so n8n can fetch it over the compose network.
 */
export async function presignGetInternal(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }),
    { expiresIn }
  );
}

/**
 * Signed PUT for a pipeline container to write its finished artifact, using
 * the internal endpoint for the same reason as presignGetInternal.
 *
 * ContentType is signed into the URL. Whatever uploads this has to send a
 * matching Content-Type header or MinIO rejects it with 403
 * SignatureDoesNotMatch, which is the usual cause of a presigned PUT failing.
 * It is worth signing anyway: the stored type is what a browser sees when it
 * later plays the video back, and a generic octet-stream downloads instead of
 * playing.
 */
export async function presignPutInternal(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

/** Confirms an upload actually landed, and reports its size. */
export async function headObject(key: string) {
  try {
    const out = await s3().send(
      new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: key })
    );
    return { exists: true, size: out.ContentLength ?? null };
  } catch {
    return { exists: false, size: null };
  }
}
