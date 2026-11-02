import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, orgs } from "@/db/schema";
import { env } from "./env";

export const SESSION_COOKIE = "nca_session";
const SESSION_DAYS = 30;

/**
 * The cookie holds "<sessionId>.<hmac>". The HMAC stops anyone from guessing
 * or tampering with a session id; the row in `sessions` is still what decides
 * whether the session is live, so signing out revokes immediately.
 */
function signId(id: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(id).digest("base64url");
}

function parseCookie(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = signId(id);
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? id : null;
}

/**
 * Whether to mark the cookie Secure.
 *
 * This cannot key off NODE_ENV. Plenty of churches will run this on plain HTTP
 * on their own network, and a browser silently discards a Secure cookie sent
 * over HTTP, which reads as "sign-in does nothing" with no error anywhere.
 * So: follow an explicit COOKIE_SECURE if set, otherwise follow whether the
 * address people actually use is HTTPS.
 */
function cookieSecure(): boolean {
  const e = env();
  if (e.COOKIE_SECURE !== undefined) return e.COOKIE_SECURE;
  return (e.PUBLIC_URL ?? "").startsWith("https://");
}

export async function createSession(userId: string): Promise<void> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id, userId, expiresAt });

  cookies().set(SESSION_COOKIE, `${id}.${signId(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (raw) {
    const id = parseCookie(raw);
    if (id) await db.delete(sessions).where(eq(sessions.id, id));
  }
  cookies().delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor" | "reviewer";
  orgId: string;
  orgName: string;
  orgSlug: string;
  theme: Record<string, string>;
};

/** Returns the signed-in person, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const id = parseCookie(raw);
  if (!id) return null;

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      orgId: orgs.id,
      orgName: orgs.name,
      orgSlug: orgs.slug,
      theme: orgs.themeJson,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(orgs, eq(orgs.id, users.orgId))
    .where(
      and(
        eq(sessions.id, id),
        gt(sessions.expiresAt, new Date()),
        isNull(users.deletedAt)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    orgId: row.orgId,
    orgName: row.orgName,
    orgSlug: row.orgSlug,
    theme: row.theme ?? {},
  };
}

/** For route handlers and pages that must not render for a stranger. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}
