import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

/**
 * Serves an object out of MinIO.
 *
 * Templates reference images by object key, not by presigned URL, and this is
 * what resolves them. The reason is a host mismatch that has no other clean
 * answer: a presigned URL is signed for the address a *browser* uses
 * (localhost:9000), but inside this container localhost is this container. The
 * host is part of the SigV4 signature, so rewriting it invalidates the URL.
 *
 * Going through here means one address works everywhere. The browser loading
 * the preview and the headless Chromium taking the screenshot both fetch a
 * relative /api/image/... path from this app, and this app talks to MinIO over
 * the compose network with credentials.
 *
 * Keys are already scoped by org in their prefix, and this service is not
 * exposed outside the compose network, so there is no per-request auth here.
 * That is a deliberate trade and it is why the service must stay internal.
 */

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT ?? "http://minio:9000",
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
  }
  return client;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key: segments } = await params;
  const key = segments.map((s) => decodeURIComponent(s)).join("/");

  // Keys are built server-side and always start with an org uuid, so anything
  // trying to climb out of the bucket is malformed by definition.
  if (key.includes("..")) {
    return new Response("Bad key", { status: 400 });
  }

  try {
    const out = await s3().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET ?? "nca-media",
        Key: key,
      })
    );

    if (!out.Body) return new Response("Not found", { status: 404 });

    return new Response(out.Body.transformToWebStream(), {
      headers: {
        "content-type": out.ContentType ?? "application/octet-stream",
        ...(out.ContentLength ? { "content-length": String(out.ContentLength) } : {}),
        // Immutable: object keys are content-addressed or uuid-prefixed, so a
        // given key never changes what it points at.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
