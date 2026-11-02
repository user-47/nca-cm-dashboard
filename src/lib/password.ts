import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id at parameters that cost roughly 60ms on a small VPS. Churches run
 * this on modest hardware, so this is tuned for "slow enough to matter, fast
 * enough that a volunteer does not notice the sign-in".
 */
const OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  plain: string
): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    // A malformed hash in the database must read as "wrong password",
    // never as a crash that leaks which accounts exist.
    return false;
  }
}
