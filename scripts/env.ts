import { config } from "dotenv";

/**
 * Loads environment the same way Next does for `npm run dev`: `.env.local`
 * first, then `.env` for anything it did not set.
 *
 * Without this, scripts see only `.env`, which carries the compose secrets but
 * not `DATABASE_URL` — that lives in `.env.local` because its host differs
 * between running on the host and running in a container. The result was
 * `npm run db:migrate` failing with "DATABASE_URL is not set" unless you
 * happened to export it by hand.
 *
 * Import this before anything that reads process.env.
 */
config({ path: [".env.local", ".env"] });
