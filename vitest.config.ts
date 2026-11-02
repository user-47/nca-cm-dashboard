import { defineConfig } from "vitest/config";

/**
 * One test run for the whole workspace. Tests live next to what they cover.
 *
 * The dashboard's own routes are still not covered — they need a database and a
 * session. Pure logic under `src/lib` is included, though: deciding where a
 * narration changes section is arithmetic, and it is the kind of judgement that
 * is much easier to pin down in a test than to eyeball in a finished video.
 */
export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "services/**/*.test.ts",
      "src/lib/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    environment: "node",
  },
});
