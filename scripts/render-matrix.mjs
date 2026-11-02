/**
 * Renders every template at every supported ratio and reports the result.
 * Throwaway verification harness for Task 4.
 */
import fs from "node:fs";

const S = process.argv[2];
const BRAND = process.argv[3];
const API = "http://localhost:3200/render";

async function render(body) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${j.error?.code}: ${j.error?.message}`);
  return j;
}

// Templates resolve object keys internally; a presigned URL would be signed for
// the browser's host and unreachable from the renderer.
//
// Pass a real photograph's object key as the third argument when you intend to
// look at these renders. Without one the harness falls back to a quote card it
// renders itself, which checks dimensions fine but carries its own text — that
// text bleeds through every hero and reads as a layout bug when it is not one.
const hero =
  process.argv[4] ??
  (
    await render({
      brandId: BRAND,
      template: "quote-card",
      params: { quote: "Backdrop" },
      width: 1200,
      height: 1200,
    })
  ).key;

const cases = [
  {
    name: "announcement",
    params: {
      eyebrow: "Sunday service",
      title: "Annual family barbecue",
      date: "2026-08-30",
      location: "Riverside Park, Shelter 3",
      cta: "Sign up at the welcome desk",
      hero,
    },
  },
  {
    name: "sermon-series",
    params: {
      seriesTitle: "Living Water",
      part: "Part 3 of 5",
      speaker: "Pastor Daniel Osei",
      date: "2026-09-06",
      hero,
    },
  },
  {
    name: "quote-card",
    params: { quote: "Be still, and know that I am God.", attribution: "Psalm 46:10" },
  },
];

const sizes = [
  [1080, 1080],
  [1080, 1350],
  [1080, 1920],
];

const results = [];
for (const c of cases) {
  for (const [w, h] of sizes) {
    try {
      const r = await render({
        brandId: BRAND,
        template: c.name,
        params: c.params,
        width: w,
        height: h,
      });
      const png = Buffer.from(await (await fetch(r.url)).arrayBuffer());
      const dims = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      const ok = dims === `${w}x${h}`;
      fs.writeFileSync(`${S}/m-${c.name}-${w}x${h}.png`, png);
      results.push(`  ${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(14)} ${String(w + "x" + h).padEnd(10)} ${dims}  ${(png.length / 1024).toFixed(0)}KB  ${r.renderMs}ms`);
    } catch (e) {
      results.push(`  FAIL  ${c.name.padEnd(14)} ${w}x${h}  ${e.message}`);
    }
  }
}

console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("  PASS")).length}/${results.length} rendered`);
