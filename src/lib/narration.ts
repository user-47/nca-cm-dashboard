/**
 * Working out where one narration recording changes section.
 *
 * The person records the whole announcement in one take and drops it in. Somebody
 * still has to decide where poster 1 gives way to poster 2, and this is that
 * decision: find the pauses, then pick the ones that best match the script the
 * person typed before recording it.
 *
 * Two halves, deliberately separated. `findSilences` needs real audio and so
 * needs a browser. `chooseBoundaries` is arithmetic over numbers and is where all
 * the judgement lives, so it can be tested directly without decoding anything.
 */

/** A run of quiet in the recording. Milliseconds from the start of the file. */
export type Silence = {
  startMs: number;
  endMs: number;
};

/** Where one section begins and ends inside the narration. */
export type Boundary = {
  startMs: number;
  durationMs: number;
};

export type BoundaryResult = {
  spans: Boundary[];
  /**
   * How the spans were arrived at. `pauses` means real silences were used;
   * `proportional` means there were not enough of them and the split came from
   * script length alone, which the person needs to be told so they check it.
   */
  method: "pauses" | "proportional";
};

/** Quieter than this counts as silence. Roughly -45 dBFS. */
const NOISE_FLOOR = 0.0056;
/** A pause has to last this long to be a section break rather than a breath. */
const MIN_SILENCE_MS = 300;
/** RMS window. Short enough to catch a gap, long enough to ride out a click. */
const WINDOW_MS = 20;
/** A section is never shorter than this, however the numbers fall out. */
const MIN_SECTION_MS = 500;

/**
 * Find the pauses in decoded audio.
 *
 * Channels are averaged first: a stereo recording with one dead channel is common
 * enough, and taking a single channel would read the whole take as silent.
 */
export function findSilences(audio: AudioBuffer): Silence[] {
  const rate = audio.sampleRate;
  const windowSize = Math.max(1, Math.round((WINDOW_MS / 1000) * rate));
  const channels: Float32Array[] = [];
  for (let c = 0; c < audio.numberOfChannels; c++) {
    channels.push(audio.getChannelData(c));
  }

  const silences: Silence[] = [];
  let quietFrom: number | null = null;

  for (let start = 0; start < audio.length; start += windowSize) {
    const end = Math.min(start + windowSize, audio.length);
    let sum = 0;
    for (let i = start; i < end; i++) {
      let frame = 0;
      for (const data of channels) frame += data[i];
      frame /= channels.length;
      sum += frame * frame;
    }
    const rms = Math.sqrt(sum / (end - start));

    if (rms < NOISE_FLOOR) {
      if (quietFrom === null) quietFrom = start;
    } else if (quietFrom !== null) {
      pushSilence(silences, quietFrom, start, rate);
      quietFrom = null;
    }
  }
  if (quietFrom !== null) pushSilence(silences, quietFrom, audio.length, rate);

  // Leading and trailing quiet are not section breaks, they are just top and
  // tail. Dropping them stops the first or last section being given no room.
  return silences.filter(
    (s) => s.startMs > 0 && s.endMs < (audio.length / rate) * 1000
  );
}

function pushSilence(into: Silence[], from: number, to: number, rate: number) {
  const startMs = (from / rate) * 1000;
  const endMs = (to / rate) * 1000;
  if (endMs - startMs >= MIN_SILENCE_MS) into.push({ startMs, endMs });
}

/**
 * Turn silences into one span per section.
 *
 * The hard case is having more pauses than section breaks, which is the normal
 * case: people pause to breathe, not only to change subject. Picking the longest
 * gaps is the obvious rule and it is wrong often enough to matter, because a
 * thinking pause mid-sentence is frequently longer than the tidy beat between two
 * items.
 *
 * So the script does the disambiguating. The person types each section's text
 * before recording it, which means the relative length of those texts predicts
 * roughly where in the recording each break should fall. Every candidate is
 * scored against that prediction and a small dynamic program picks the
 * increasing set of breaks with the least total error.
 *
 * `textLengths` and `sectionCount` come from the sections in order.
 */
export function chooseBoundaries(
  silences: Silence[],
  totalMs: number,
  textLengths: number[]
): BoundaryResult {
  const sectionCount = textLengths.length;
  if (sectionCount === 0) return { spans: [], method: "proportional" };
  if (sectionCount === 1) {
    return { spans: [{ startMs: 0, durationMs: totalMs }], method: "pauses" };
  }

  const targets = cumulativeTargets(textLengths, totalMs);
  const breaksNeeded = sectionCount - 1;

  // Mid-pause, so neither the outgoing nor the incoming section clips a word.
  const candidates = silences
    .map((s) => (s.startMs + s.endMs) / 2)
    .filter((t) => t > 0 && t < totalMs)
    .sort((a, b) => a - b);

  if (candidates.length < breaksNeeded) {
    return { spans: spansFrom(targets, totalMs), method: "proportional" };
  }

  const picked = leastErrorSubset(candidates, targets);
  if (!picked) return { spans: spansFrom(targets, totalMs), method: "proportional" };

  return { spans: spansFrom(picked, totalMs), method: "pauses" };
}

/**
 * Where each break would fall if the recording were spent strictly in proportion
 * to how much script each section carries.
 *
 * Sections with no text still need room, so every section is given a floor of one
 * notional character. Without it a section left blank would be handed a zero
 * length span and its poster would never appear.
 */
function cumulativeTargets(textLengths: number[], totalMs: number): number[] {
  const weights = textLengths.map((n) => Math.max(1, n));
  const total = weights.reduce((a, b) => a + b, 0);
  const targets: number[] = [];
  let running = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    running += weights[i];
    targets.push((running / total) * totalMs);
  }
  return targets;
}

/**
 * Pick one candidate per break, in order, minimising total distance from where
 * the script says each break belongs.
 *
 * `best[i][j]` is the cheapest way to satisfy the first `j` breaks using only
 * candidates up to `i`. Breaks must land in increasing order, and two breaks
 * cannot share a candidate, which is what makes this a scan rather than a search
 * over every combination.
 */
function leastErrorSubset(candidates: number[], targets: number[]): number[] | null {
  const n = candidates.length;
  const k = targets.length;

  const cost: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(k + 1).fill(Infinity)
  );
  const from: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(k + 1).fill(-1)
  );
  for (let i = 0; i <= n; i++) cost[i][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= Math.min(i, k); j++) {
      // Skip this candidate.
      cost[i][j] = cost[i - 1][j];
      from[i][j] = 0;
      // Or use it for break j.
      const used = cost[i - 1][j - 1] + Math.abs(candidates[i - 1] - targets[j - 1]);
      if (used < cost[i][j]) {
        cost[i][j] = used;
        from[i][j] = 1;
      }
    }
  }
  if (!Number.isFinite(cost[n][k])) return null;

  const picked: number[] = [];
  let i = n;
  let j = k;
  while (j > 0) {
    if (from[i][j] === 1) {
      picked.push(candidates[i - 1]);
      j--;
    }
    i--;
  }
  return picked.reverse();
}

/**
 * Break times to spans, clamped so no section collapses.
 *
 * Breaks are nudged apart rather than rejected, because a person dragging a
 * handle should meet a floor, not an error.
 */
function spansFrom(breaks: number[], totalMs: number): Boundary[] {
  const edges = [0, ...breaks, totalMs];

  for (let i = 1; i < edges.length; i++) {
    if (edges[i] < edges[i - 1] + MIN_SECTION_MS) {
      edges[i] = edges[i - 1] + MIN_SECTION_MS;
    }
  }
  // If the floor pushed past the end, pull back from the right so the last
  // section keeps its room and the total still lands exactly on totalMs.
  edges[edges.length - 1] = totalMs;
  for (let i = edges.length - 2; i > 0; i--) {
    if (edges[i] > edges[i + 1] - MIN_SECTION_MS) {
      edges[i] = edges[i + 1] - MIN_SECTION_MS;
    }
  }

  const spans: Boundary[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const startMs = Math.max(0, Math.round(edges[i]));
    const endMs = Math.round(edges[i + 1]);
    spans.push({ startMs, durationMs: Math.max(0, endMs - startMs) });
  }
  return spans;
}

/**
 * Decode an uploaded recording and work out the section spans in one go.
 *
 * Browser only. `AudioContext` is closed afterwards: browsers cap how many can be
 * open at once, and a builder session can see several uploads.
 */
export async function boundariesForUpload(
  file: File,
  textLengths: number[]
): Promise<BoundaryResult & { totalMs: number }> {
  const ctx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)();
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const totalMs = Math.round(audio.duration * 1000);
    const silences = findSilences(audio);
    return { ...chooseBoundaries(silences, totalMs, textLengths), totalMs };
  } finally {
    void ctx.close();
  }
}
