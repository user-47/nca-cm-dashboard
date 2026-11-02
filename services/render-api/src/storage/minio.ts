import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../lib/config";

/**
 * The same bucket the dashboard already uses. Poster output lands under a
 * prefix so it never collides with sermon audio or announcement video.
 *
 * Reads are presigned rather than public. The bucket holds a church's whole
 * media library, and opening it up to serve posters would expose all of it.
 */

let internal: S3Client | null = null;
let publicClient: S3Client | null = null;

function clientFor(endpoint: string): S3Client {
  const c = config();
  return new S3Client({
    endpoint,
    region: c.S3_REGION,
    forcePathStyle: c.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: c.S3_ACCESS_KEY,
      secretAccessKey: c.S3_SECRET_KEY,
    },
  });
}

function s3(): S3Client {
  if (!internal) internal = clientFor(config().S3_ENDPOINT);
  return internal;
}

/**
 * Signed URLs must be signed for the host the viewer will actually use.
 * Inside compose this service reaches MinIO at http://minio:9000, but a browser
 * has to use localhost, and a URL signed for one host fails against the other.
 */
function s3Public(): S3Client {
  const c = config();
  if (!c.S3_PUBLIC_ENDPOINT) return s3();
  if (!publicClient) publicClient = clientFor(c.S3_PUBLIC_ENDPOINT);
  return publicClient;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: config().S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3Public(),
    new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: key }),
    { expiresIn }
  );
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3().send(
      new HeadObjectCommand({ Bucket: config().S3_BUCKET, Key: key })
    );
    return true;
  } catch {
    return false;
  }
}
