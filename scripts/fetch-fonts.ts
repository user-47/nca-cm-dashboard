import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { FONT_REGISTRY } from "../packages/brand-tokens/src/fonts";

/**
 * Downloads the .woff2 files the font registry promises, into the templates
 * app's public/fonts.
 *
 *   npm run fonts:fetch
 *
 * Fonts are self-hosted because a screenshot must never wait on a third-party
 * request: Playwright would race it and capture a fallback face. Running this
 * is a one-time setup step (and a maintenance step when the registry gains a
 * face), not something that happens at build or render time.
 *
 * The registry is the source of truth. Adding a weight there and re-running
 * this is the whole workflow.
 */

const OUT_DIR = path.resolve("services/templates/public/fonts");

/** Only the plain latin subset. Church posters do not need cyrillic. */
const LATIN_BLOCK = /\/\*\s*latin\s*\*\/\s*@font-face\s*\{([^}]+)\}/;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function cssFor(family: string, weight: number): Promise<string> {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
    `:wght@${weight}&display=block`;
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) {
    throw new Error(`Google Fonts answered ${res.status} for ${family} ${weight}`);
  }
  return res.text();
}

function latinWoff2Url(css: string, family: string, weight: number): string {
  const block = LATIN_BLOCK.exec(css);
  if (!block) {
    throw new Error(`No latin subset found for ${family} ${weight}`);
  }
  const src = /src:\s*url\((https:\/\/[^)]+\.woff2)\)/.exec(block[1]);
  if (!src) {
    throw new Error(`No woff2 url in the latin block for ${family} ${weight}`);
  }
  return src[1];
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // The registry lists the same face under more than one tag (Spectral is both
  // serif-editorial and serif-text), so collapse to unique files first.
  const wanted = new Map<string, { family: string; weight: number }>();
  for (const entry of Object.values(FONT_REGISTRY)) {
    for (const face of entry.files) {
      wanted.set(face.file, { family: entry.family, weight: face.weight });
    }
  }

  let fetched = 0;
  let skipped = 0;

  for (const [file, { family, weight }] of [...wanted].sort()) {
    const dest = path.join(OUT_DIR, file);

    const existing = await stat(dest).catch(() => null);
    if (existing && existing.size > 0) {
      skipped++;
      continue;
    }

    const css = await cssFor(family, weight);
    const url = latinWoff2Url(css, family, weight);
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`);

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error(`${file} came back empty`);
    await writeFile(dest, bytes);

    console.log(`  ${file.padEnd(26)} ${family} ${weight}  ${(bytes.length / 1024).toFixed(1)} KB`);
    fetched++;
  }

  console.log(
    `\n${fetched} downloaded, ${skipped} already present, ${wanted.size} total in ${OUT_DIR}`
  );
}

main().catch((cause) => {
  console.error("Fetching fonts failed:", cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
