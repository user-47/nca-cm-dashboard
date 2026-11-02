import { describe, expect, it } from "vitest";
import { chooseBoundaries, findSilences, type Silence } from "./narration";

/** A pause centred on `atMs`, long enough to count. */
function pause(atMs: number, lengthMs = 600): Silence {
  return { startMs: atMs - lengthMs / 2, endMs: atMs + lengthMs / 2 };
}

describe("chooseBoundaries", () => {
  it("uses the pauses when there are exactly as many as needed", () => {
    const { spans, method } = chooseBoundaries(
      [pause(10_000), pause(20_000)],
      30_000,
      [100, 100, 100]
    );
    expect(method).toBe("pauses");
    expect(spans).toEqual([
      { startMs: 0, durationMs: 10_000 },
      { startMs: 10_000, durationMs: 10_000 },
      { startMs: 20_000, durationMs: 10_000 },
    ]);
  });

  it("cuts mid-pause so neither section clips a word", () => {
    // A two second gap running 9s to 11s should break at 10s, not at either edge.
    const { spans } = chooseBoundaries(
      [{ startMs: 9_000, endMs: 11_000 }],
      20_000,
      [50, 50]
    );
    expect(spans[0].durationMs).toBe(10_000);
    expect(spans[1].startMs).toBe(10_000);
  });

  it("lets the script pick when there are more pauses than breaks", () => {
    /**
     * The real failure this guards. Breathing pauses at 4s and 16s are longer
     * than the true section break at 10s, so "take the longest gaps" would cut in
     * the wrong places. Equal script lengths over 20s put the break at 10s.
     */
    const silences = [pause(4_000, 900), pause(10_000, 400), pause(16_000, 900)];
    const { spans, method } = chooseBoundaries(silences, 20_000, [100, 100]);
    expect(method).toBe("pauses");
    expect(spans[0].durationMs).toBe(10_000);
  });

  it("follows uneven script lengths rather than splitting evenly", () => {
    // Section one carries three times the script, so the break belongs near 15s.
    const silences = [pause(5_000), pause(15_000)];
    const { spans } = chooseBoundaries(silences, 20_000, [300, 100]);
    expect(spans[0].durationMs).toBe(15_000);
  });

  it("falls back to proportional when there are too few pauses", () => {
    const { spans, method } = chooseBoundaries([pause(10_000)], 30_000, [
      100, 100, 100,
    ]);
    expect(method).toBe("proportional");
    expect(spans.map((s) => s.durationMs)).toEqual([10_000, 10_000, 10_000]);
  });

  it("falls back proportionally when there are no pauses at all", () => {
    const { spans, method } = chooseBoundaries([], 40_000, [100, 300]);
    expect(method).toBe("proportional");
    expect(spans).toEqual([
      { startMs: 0, durationMs: 10_000 },
      { startMs: 10_000, durationMs: 30_000 },
    ]);
  });

  it("gives an empty section room, rather than a span of nothing", () => {
    // A section whose text was never typed still has a poster to show.
    const { spans } = chooseBoundaries([], 30_000, [100, 0, 100]);
    expect(spans).toHaveLength(3);
    for (const span of spans) expect(span.durationMs).toBeGreaterThan(0);
  });

  it("always partitions the recording exactly, leaving no gap or overlap", () => {
    const cases: Array<[Silence[], number, number[]]> = [
      [[pause(3_000), pause(7_000)], 10_000, [10, 20, 30]],
      [[pause(1_000), pause(2_000), pause(8_000)], 12_000, [1, 1]],
      [[], 5_000, [5, 5, 5, 5]],
      [[pause(500, 400), pause(4_500, 400)], 5_000, [100, 1, 100]],
    ];

    for (const [silences, totalMs, lengths] of cases) {
      const { spans } = chooseBoundaries(silences, totalMs, lengths);
      expect(spans).toHaveLength(lengths.length);
      expect(spans[0].startMs).toBe(0);
      for (let i = 1; i < spans.length; i++) {
        // Each section starts exactly where the previous one ended.
        expect(spans[i].startMs).toBe(spans[i - 1].startMs + spans[i - 1].durationMs);
      }
      const last = spans[spans.length - 1];
      expect(last.startMs + last.durationMs).toBe(totalMs);
    }
  });

  it("keeps breaks in order even when pauses bunch up at one end", () => {
    const silences = [pause(900, 400), pause(1_400, 400), pause(1_900, 400)];
    const { spans } = chooseBoundaries(silences, 30_000, [100, 100, 100]);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].startMs).toBeGreaterThan(spans[i - 1].startMs);
    }
  });

  it("handles a single section by handing it the whole recording", () => {
    const { spans } = chooseBoundaries([pause(5_000)], 12_345, [80]);
    expect(spans).toEqual([{ startMs: 0, durationMs: 12_345 }]);
  });

  it("returns nothing when there are no sections", () => {
    expect(chooseBoundaries([], 10_000, []).spans).toEqual([]);
  });
});

/**
 * A stand-in for a decoded recording. `segments` are [milliseconds, amplitude]
 * pairs, so a take can be described as sound, pause, sound without needing a
 * real file or a browser.
 */
function buffer(segments: Array<[number, number]>, channels = 1): AudioBuffer {
  const rate = 8000;
  const total = segments.reduce((n, [ms]) => n + Math.round((ms / 1000) * rate), 0);
  const data = new Float32Array(total);
  let at = 0;
  for (const [ms, amplitude] of segments) {
    const count = Math.round((ms / 1000) * rate);
    for (let i = 0; i < count; i++) {
      // Alternating, so the mean is zero and only the amplitude carries.
      data[at + i] = i % 2 === 0 ? amplitude : -amplitude;
    }
    at += count;
  }
  return {
    sampleRate: rate,
    length: total,
    numberOfChannels: channels,
    duration: total / rate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("findSilences", () => {
  it("finds a pause between two stretches of speech", () => {
    const found = findSilences(buffer([
      [4000, 0.5],
      [600, 0],
      [4000, 0.5],
    ]));
    expect(found).toHaveLength(1);
    expect(found[0].startMs).toBeCloseTo(4000, -2);
    expect(found[0].endMs).toBeCloseTo(4600, -2);
  });

  it("ignores a gap too short to be a section break", () => {
    // A breath, not a change of subject.
    expect(findSilences(buffer([[3000, 0.5], [120, 0], [3000, 0.5]]))).toEqual([]);
  });

  it("ignores silence at the very start and end", () => {
    // Leading and trailing quiet is top and tail, not a break, and counting it
    // would leave the first or last section with no room.
    const found = findSilences(buffer([
      [800, 0],
      [3000, 0.5],
      [800, 0],
    ]));
    expect(found).toEqual([]);
  });

  it("finds every pause in a longer take", () => {
    const found = findSilences(buffer([
      [3000, 0.5], [500, 0],
      [3000, 0.5], [500, 0],
      [3000, 0.5],
    ]));
    expect(found).toHaveLength(2);
    expect(found[0].startMs).toBeLessThan(found[1].startMs);
  });

  it("does not read quiet speech as silence", () => {
    // Well above the floor, but far below a normal take.
    expect(findSilences(buffer([[2000, 0.5], [600, 0.05], [2000, 0.5]]))).toEqual([]);
  });
});
