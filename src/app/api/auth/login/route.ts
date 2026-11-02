import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { apiError, apiOk, handle } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function POST(request: Request) {
  return handle(async () => {
    const { email, password } = schema.parse(await request.json());

    const row = await db.query.users.findFirst({
      where: and(eq(users.email, email.toLowerCase().trim()), isNull(users.deletedAt)),
    });

    // Same message and roughly the same work either way, so this cannot be
    // used to find out which email addresses have accounts.
    const ok = row ? await verifyPassword(row.passwordHash, password) : false;
    if (!row || !ok) {
      return apiError("That email and password do not match an account.", 401);
    }

    await createSession(row.id);
    return apiOk({ ok: true });
  });
}
