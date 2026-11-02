import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Every app-to-n8n call and every n8n-to-app callback carries an X-Signature
 * header holding an HMAC of the exact request body. Anything unsigned or
 * wrongly signed is rejected, so finding the webhook URL is not enough to
 * trigger a render or fake a "complete" status.
 */

export const SIGNATURE_HEADER = "x-signature";

export function sign(body: string, secret = env().PIPELINE_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verify(
  body: string,
  signature: string | null,
  secret = env().PIPELINE_SECRET
): boolean {
  if (!signature) return false;
  const expected = sign(body, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  // timingSafeEqual throws on length mismatch, so guard before comparing.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Reads and verifies a callback body. Returns the parsed JSON, or null when
 * the signature does not check out. Callers must treat null as a 401.
 */
export async function readSignedJson<T = unknown>(
  request: Request
): Promise<{ ok: true; data: T } | { ok: false }> {
  const raw = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!verify(raw, signature)) return { ok: false };
  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return { ok: false };
  }
}
