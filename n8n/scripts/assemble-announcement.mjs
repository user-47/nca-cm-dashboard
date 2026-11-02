/**
 * Assembles an announcement video from a plan written by the n8n workflow.
 *
 *   node /scripts/assemble-announcement.mjs /data/jobs/<jobId>.json
 *
 * Node rather than a shell script on purpose: the n8n image is a hardened
 * Alpine with no package manager, so bash, jq, and curl are not available and
 * cannot be installed. Node is always there, and FFmpeg arrives as two static
 * binaries. That also means no shell quoting, so a poster filename containing
 * a quote cannot break the render.
 *
 * Every input arrives as a presigned URL, so this never needs storage
 * credentials.
 *
 * Two decisions carry the quality:
 *   1. Every clip is encoded to identical video and audio parameters, so the
 *      final concat is a stream copy with no seam at the joins. Mismatched fps
 *      or SAR between clips is the usual cause of a glitch at a cut.
 *   2. Audio is normalised per clip, not once at the end. Recorded narration,
 *      generated voiceover, and the intro all arrive at different levels, and
 *      normalising each one is what makes them match.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

// Fail with one readable line, not a stack trace. The workflow puts whatever
// lands on stderr in front of the person, so it has to read like a sentence.
for (const signal of ["uncaughtException", "unhandledRejection"]) {
  process.on(signal, (cause) => {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`
    );
    process.exit(1);
  });
}

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

const WIDTH = Number(process.env.NCA_WIDTH ?? 1920);
const HEIGHT = Number(process.env.NCA_HEIGHT ?? 1080);
const FPS = Number(process.env.NCA_FPS ?? 30);
const CRF = process.env.NCA_CRF ?? "20";
const PRESET = process.env.NCA_PRESET ?? "medium";
const ABITRATE = process.env.NCA_ABITRATE ?? "192k";

// loudnorm to the streaming target, one sample rate so concat never has to
// convert, then a limiter with a little headroom.
const AFILTER =
  "aresample=44100,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.97";

// Letterbox rather than crop: a poster with the wrong aspect should lose
// nothing. setsar and a fixed fps are what make the clips concat-compatible.
const VFILTER =
  `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
  `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,` +
  `setsar=1,fps=${FPS},format=yuv420p`;

const ENCODE = [
  "-c:v", "libx264",
  "-preset", PRESET,
  "-crf", CRF,
  "-pix_fmt", "yuv420p",
  "-g", String(FPS * 2),
  "-keyint_min", String(FPS),
  "-c:a", "aac",
  "-b:a", ABITRATE,
  "-ar", "44100",
  "-ac", "2",
  "-movflags", "+faststart",
];

const planPath = process.argv[2];
if (!planPath) {
  console.error("Pass the path to the plan JSON.");
  process.exit(2);
}

const plan = JSON.parse(await readFile(planPath, "utf8"));
const work = path.join(process.env.NCA_WORK_DIR ?? "/data/work", plan.jobId);
const clipsDir = path.join(work, "clips");
const inDir = path.join(work, "in");
const logPath = path.join(work, "ffmpeg.log");

await rm(work, { recursive: true, force: true });
await mkdir(clipsDir, { recursive: true });
await mkdir(inDir, { recursive: true });
await writeFile(logPath, "");

/** Progress goes to stderr; stdout is reserved for the result JSON. */
function log(message) {
  process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${message}\n`);
}

/**
 * `what` names the file the way the person sees it, because this message is
 * what the builder shows when a render stops.
 */
async function download(url, dest, what) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      `${what} could not be downloaded from storage. Check that MinIO is running and reachable from n8n.`
    );
  }
  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? `${what} could not be read from storage. The signed link had expired by the time the render reached it.`
        : `${what} could not be read from storage (${res.status}).`
    );
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

/**
 * FFmpeg runs with -loglevel error -nostats and its stderr appended to a log
 * file, so a long render cannot fill the pipe buffer and stall the process.
 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-nostats", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const logStream = createWriteStream(logPath, { flags: "a" });
    child.stderr.pipe(logStream);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`FFmpeg exited with code ${code}. See ${logPath}.`))
    );
  });
}

function probeDurationMs(file) {
  return new Promise((resolve) => {
    const child = spawn(FFPROBE, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      file,
    ]);
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", () => resolve(0));
    child.on("close", () => {
      const seconds = parseFloat(out.trim());
      resolve(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0);
    });
  });
}

/**
 * An intro or outro is an existing video. It still gets re-encoded to the
 * house spec, because a clip that differs in fps or SAR is exactly what puts a
 * glitch at the join.
 */
async function encodeBookend(url, name) {
  const src = path.join(inDir, `${name}.src`);
  await download(url, src, `The ${name}`);
  log(`encoding ${name}`);
  const out = path.join(clipsDir, `${name}.mp4`);
  await runFfmpeg(["-i", src, "-vf", VFILTER, "-af", AFILTER, ...ENCODE, out]);
  return out;
}

/**
 * One clip per section: the poster held for exactly the length of that
 * section's audio.
 *
 * The length is set with an explicit -t taken from probing the audio, not with
 * -shortest. -shortest decides when to stop from what the muxer has seen, and
 * against a -loop 1 image input that races ahead of a buffering audio filter
 * it can overrun badly: a 3.0s narration produced a 5.6s clip in testing.
 * Probing first makes the timing exact, which is the whole model of this
 * product, and it is what the person was shown on the Section Strip.
 */
async function encodeSection(section, index) {
  const poster = path.join(inDir, `poster-${index}`);
  const audio = path.join(inDir, `audio-${index}`);
  await download(section.poster.url, poster, `Section ${index + 1}: the poster`);
  await download(section.audio.url, audio, `Section ${index + 1}: the audio`);

  const audioMs = await probeDurationMs(audio);
  if (!audioMs) {
    throw new Error(
      `Section ${index + 1}: that audio file could not be read. Replace it and run again.`
    );
  }
  const seconds = (audioMs / 1000).toFixed(3);

  log(`encoding section ${index + 1} (${seconds}s)`);
  const out = path.join(clipsDir, `section-${String(index).padStart(4, "0")}.mp4`);
  await runFfmpeg([
    "-loop", "1",
    "-framerate", String(FPS),
    "-i", poster,
    "-i", audio,
    "-vf", VFILTER,
    "-af", AFILTER,
    ...ENCODE,
    "-t", seconds,
    out,
  ]);
  return out;
}

/**
 * A section's poster held for its span of the narration, with no audio on it.
 *
 * The length comes from the plan rather than from probing, because in this mode
 * there is no per-section file to probe: the app worked the spans out from the
 * pauses in the recording and the person may have adjusted them by hand. Those
 * are the numbers the Section Strip showed, so those are the numbers the video
 * has to honour.
 */
async function encodeSilentSection(section, index) {
  const poster = path.join(inDir, `poster-${index}`);
  await download(section.poster.url, poster, `Section ${index + 1}: the poster`);

  const ms = Number(section.durationMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(
      `Section ${index + 1}: no length was set for it. Set its boundaries on the strip and run again.`
    );
  }
  const seconds = (ms / 1000).toFixed(3);

  log(`encoding section ${index + 1} (${seconds}s, silent)`);
  const out = path.join(clipsDir, `section-${String(index).padStart(4, "0")}.mp4`);
  await runFfmpeg([
    "-loop", "1",
    "-framerate", String(FPS),
    "-i", poster,
    "-an",
    "-vf", VFILTER,
    ...ENCODE,
    "-t", seconds,
    out,
  ]);
  return out;
}

/**
 * The narration mode body: every poster in order, then the whole recording laid
 * over them in one pass.
 *
 * The recording is deliberately never cut into per-section files. Loudness is
 * normalised per clip everywhere else in this script because those clips come
 * from different places at different levels, but one continuous read is one
 * source, and normalising slices of it independently makes the level pump
 * audibly across the person's own sentences. One loudnorm over the whole thing
 * keeps it sounding like what they recorded.
 */
async function buildNarratedBody(sections) {
  const silent = [];
  for (const [index, section] of sections.entries()) {
    silent.push(await encodeSilentSection(section, index));
  }

  const listPath = path.join(work, "body.txt");
  await writeFile(
    listPath,
    silent.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n") + "\n"
  );

  const mute = path.join(clipsDir, "body-mute.mp4");
  log(`concatenating ${silent.length} posters`);
  await runFfmpeg([
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:v", "copy", "-an",
    mute,
  ]);

  const narration = path.join(inDir, "narration");
  await download(plan.narration.url, narration, "The narration");
  const narrationMs = await probeDurationMs(narration);
  if (!narrationMs) {
    throw new Error("That narration file could not be read. Replace it and run again.");
  }

  // The posters were cut to spans of this recording, so the two run to the same
  // length. -shortest guards the rounding: spans are whole milliseconds and a
  // frame is 33ms, so the video can land a fraction of a frame either side.
  const out = path.join(clipsDir, "body.mp4");
  log(`laying narration over the body (${(narrationMs / 1000).toFixed(3)}s)`);
  await runFfmpeg([
    "-i", mute,
    "-i", narration,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-af", AFILTER,
    "-c:a", "aac",
    "-b:a", ABITRATE,
    "-ar", "44100",
    "-ac", "2",
    "-shortest",
    out,
  ]);
  return out;
}

// ------------------------------------------------------------------ build

const sections = plan.sections ?? [];
if (sections.length === 0) {
  console.error("The plan has no sections.");
  process.exit(2);
}

const order = [];

// Intro and outro keep their own audio either way. The narration covers only
// the sections, so there is nothing to duck or offset at the bookends.
if (plan.intro?.url) order.push(await encodeBookend(plan.intro.url, "intro"));

if (plan.narration?.url) {
  order.push(await buildNarratedBody(sections));
} else {
  for (const [index, section] of sections.entries()) {
    order.push(await encodeSection(section, index));
  }
}

if (plan.outro?.url) order.push(await encodeBookend(plan.outro.url, "outro"));

// ----------------------------------------------------------------- concat
// Every clip now has identical parameters, so the demuxer copies the video
// through untouched. Audio is re-encoded only to run the final limiter across
// the joins, which is cheap next to a second full video pass.

const listPath = path.join(work, "concat.txt");
await writeFile(
  listPath,
  // The concat demuxer takes single quotes, and a literal quote inside a path
  // is escaped as '\''. These paths are ours, but escape anyway.
  order.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n") + "\n"
);

await mkdir(path.dirname(plan.outPath), { recursive: true });
log(`concatenating ${order.length} clips`);
await runFfmpeg([
  "-f", "concat",
  "-safe", "0",
  "-i", listPath,
  "-c:v", "copy",
  "-c:a", "aac",
  "-b:a", ABITRATE,
  "-ar", "44100",
  "-ac", "2",
  "-af", "alimiter=limit=0.97",
  "-movflags", "+faststart",
  plan.outPath,
]);

const durationMs = await probeDurationMs(plan.outPath);

// The only thing on stdout is the result, so the n8n node can parse it.
process.stdout.write(JSON.stringify({ outPath: plan.outPath, durationMs }));
