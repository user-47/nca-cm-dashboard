# NCA Creative Media

A dashboard a church media team uses to produce voiceovers and announcement
videos, with posters, sermon Shorts, and delayed French translation arriving in
later phases. Built to be self-hosted by one church at a time.

This repository holds **Phase 1**: sign-in, projects, the voice engine, and the
announcement video generator.

---

## How the pieces fit

Two deployables, kept deliberately separate.

**The app** (this repository) owns everything a person sees and everything that
has to be reliable and queryable: authentication, the project and job database,
the announcement builder, and settings. It is the source of truth for job
status. It never runs FFmpeg or model inference itself.

**The pipelines** (`/n8n`) do the heavy, long-running work: text to speech,
FFmpeg assembly, and later transcription and translation. They are imported into
a self-hosted n8n instance and run as a separate service.

```
Person clicks "Create video"
        |
        v
App writes a job row (queued)  ->  POST to an n8n webhook
        |                            { jobId, type, payload, callbackUrl }
        |                            n8n returns 200 immediately (ack only)
        v
App shows the job as queued, then updates as callbacks arrive
                                     |
                   n8n renders, writes the video to MinIO, and POSTs
                   progress to {callbackUrl} = /api/jobs/:id/status
```

Four rules keep the two sides decoupled:

- **Large files never travel through a webhook.** The browser uploads straight
  to MinIO on a presigned PUT. The app and n8n exchange object keys and signed
  URLs, never bytes.
- **Everything is signed.** Every app-to-n8n call and every n8n-to-app callback
  carries an HMAC of the exact request body in `X-Signature`. Unsigned requests
  are rejected, so finding a webhook URL is not enough to trigger a render or
  fake a completion.
- **The app database is the single source of truth for status.** n8n reports; it
  does not hold state the app needs.
- **Human approval gates use the n8n Wait node**, not polling. That matters from
  Phase 3 onward; the `resume_url` column on `jobs` is already there for it.

---

## Running it

You need Docker and about 4 GB of free disk.

```bash
cp .env.example .env
```

Fill in the five blank values. Generate each secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Then:

```bash
docker compose up -d              # app, Postgres, MinIO, n8n
docker compose run --rm seed      # creates the first church and admin
```

Open http://localhost:3000 and sign in with the `ADMIN_EMAIL` and
`ADMIN_PASSWORD` from your `.env`.

To run Kokoro for self-hosted voices as well:

```bash
docker compose --profile voice up -d
```

### Importing the pipelines

The app is usable for uploads and drafts without n8n, but "Generate voiceover"
and "Create video" need it.

1. Open http://localhost:5678 and create the owner account.
2. Add an **S3 credential** named `NCA MinIO`: endpoint `http://minio:9000`,
   region `us-east-1`, your `S3_ACCESS_KEY` and `S3_SECRET_KEY`, and force path
   style on.
3. Import `n8n/voiceover.json` and `n8n/announcement-assembly.json`.
4. Activate both workflows.

Both read `PIPELINE_SECRET` from the environment, which compose already passes
in. If it does not match the app's, every call fails with a signature mismatch,
which is the intended behaviour.

### Local development

Run the services in Docker and the app on your machine:

```bash
docker compose up -d db minio minio-init n8n
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Add the local overrides at the bottom of `.env.example` to your `.env` so the
app reaches the containers on `localhost` rather than on compose hostnames. One
thing to watch: `APP_URL` is the address **n8n** uses to call back, so pointing
it at `http://localhost:3000` while n8n runs in Docker will not work. Use
`http://host.docker.internal:3000`.

---

## How the announcement builder works

An announcement is an ordered list of sections. Each section is one poster and
one audio file, and the poster stays on screen for exactly as long as that audio
runs. A fixed intro and outro bookend the result.

Audio comes one of two ways.

**A file per section**, either **recorded** (the person uploads their own, which
sounds better) or **generated** from the section text through the voice engine.
Timing is then a plain probe of each file.

**Or one recording for the whole video.** The person reads the announcement in a
single take and drops it in; the browser finds the pauses and turns them into a
section per poster. Where there are more pauses than breaks, which is normal
because people breathe, the typed script decides: the relative length of each
section's text says roughly where in the recording each break belongs, and the
candidate set closest to that prediction wins. Too few pauses to work with and it
splits by script length instead and says so, rather than guessing quietly. Either
way the boundaries are draggable on the strip.

The recording is never cut into per-section files. Loudness is normalised per
clip everywhere else here because those clips come from different places at
different levels, but one continuous read is one source, and normalising slices
of it independently makes the level pump across the person's own sentences.
Sections carry offsets into the one file, and it is laid down in a single pass.

### The Section Strip

The builder's centrepiece. Sections are a horizontal filmstrip of poster cards,
and each card's **width is proportional to its audio length**, so the strip
previews the shape and total runtime of the finished video before anything
renders. A section with no audio yet sits at a placeholder width and animates
out to its true width the moment a duration arrives, either from the browser
measuring an upload or from the voiceover pipeline reporting back.

### What the render actually does

[assemble-announcement.mjs](n8n/scripts/assemble-announcement.mjs) is where the
video gets made. Three decisions carry most of the quality:

- **Every clip is encoded to identical parameters** (resolution, fps, pixel
  format, SAR), which is what lets the final concat be a stream copy with no
  seam at the joins. Mismatched SAR or fps between clips is the usual cause of a
  glitch at a cut.
- **Audio is normalised per clip, not once at the end**
  (`loudnorm=I=-14:TP=-1.5:LRA=11`, `aresample=44100`, `alimiter=limit=0.97`).
  Recorded narration, generated voiceover, and the intro all arrive at different
  levels, and normalising each one is what makes them match. A final limiter
  runs across the joins. Measured on a test render whose three sections went in
  at an 18x gain spread, the sections came out within 0.2 dB of each other.
- **Section length comes from probing the audio, not from `-shortest`.**
  `-shortest` decides when to stop from what the muxer has seen, and against a
  looped still image that races ahead of a buffering audio filter it can
  overrun: in testing a 3.0s narration produced a 5.6s clip. Probing first makes
  each poster hold for exactly its audio length, which is the whole timing model
  of this product and what the Section Strip already promised the person.

With one narration covering the video, the sections are encoded silently with
`-t` taken from the plan rather than from a probe, concatenated into a mute body,
and the recording muxed over that body in one pass. The intro and outro keep
their own audio and sit outside it, so there is nothing to duck or offset. Both
paths were measured against the same twelve seconds of material and came out at
the same duration, frame count, and audio stream.

FFmpeg runs with `-loglevel error -nostats` and its stderr redirected to a log
file, so a long render cannot overflow the process buffer and stall the node.
When a render stops, the last few lines of that log are what the app shows.

The script is Node rather than shell because the n8n image is a hardened Alpine
with no package manager: `bash`, `jq`, and `curl` cannot be installed there.
FFmpeg comes in as two static binaries, and everything else is Node, which the
image already ships. A side benefit is that there is no shell quoting anywhere,
so a poster filename containing a quote cannot break a render.

---

## Theme

Everything visual is a CSS custom property, so a church rebrands without a code
change. The defaults live in [globals.css](src/app/globals.css); an org
overrides any of them through `orgs.theme_json`, which the app layout applies as
inline custom properties on the wrapper.

```
--ink        #1B2430   structure, primary text
--ink-muted  #5A6472   secondary text
--paper      #ECEEE9   app background
--surface    #FAFBF8   cards and panels
--brass      #B08532   primary actions, active nav, focus
--forest     #2E4A3C   secondary structure, confirmed states
```

Brass is deliberately scarce: the one primary action on a screen, the active nav
item, and the focus ring. Nothing else.

Type is Spectral for headings, IBM Plex Sans for the working UI, and IBM Plex
Mono for ids, timestamps, and durations, so data reads as data.
`next/font` downloads all three at build time and serves them from this app's
own origin, so a running install never calls a font CDN. The build step itself
needs network access once. For a fully air-gapped build, vendor the `.woff2`
files into `public/fonts` and swap the `next/font/google` imports in
[layout.tsx](src/app/layout.tsx) for `next/font/local`.

---

## Layout

```
src/
  app/
    (app)/          signed-in pages: projects, announcements, settings
    (auth)/login    sign-in
    api/            route handlers, including the signed pipeline callback
  components/
    announcements/  the builder, the Section Strip, the section editor
    settings/       voice management
    shell/          left rail and top bar
    ui/             buttons, fields, file upload, status pills
  db/schema.ts      the whole data model
  lib/
    hmac.ts         request signing, both directions
    n8n.ts          the app-to-pipeline client
    s3.ts           presigned uploads and reads
    session.ts      cookie sessions
n8n/
  voiceover.json               text to speech, Kokoro or Fish
  announcement-assembly.json   the render pipeline
  scripts/                     the FFmpeg work
drizzle/            generated SQL migrations
```

`jobs.status` moves through `queued`, `running`, `awaiting_review`, `rendering`,
`complete`, `failed`. Each pipeline uses a subset.

---

## What is not here yet

Phase 2 is the poster creator: HTML and CSS templates rendered to PNG by a
headless Chromium service the app calls directly, since that work is fast and
synchronous. Phase 3 is auto Shorts with a human approval gate before anything
renders. Phase 4 is the delayed French translation feed, captions first.

The schema already carries `poster_tmpls`, `shorts_cands`, `xlate_sessions`, and
`xlate_chunks`, so those phases add pipelines and screens rather than migrations
that move existing data.

Ship and use Phase 1 at NCA before starting Phase 2.

### Two things to settle before this is sold to other churches

- **n8n licensing.** Bundling n8n into a product sold to others runs into its
  Sustainable Use License and its separate embed program. Confirm the terms
  before selling, since it may change how this is distributed.
- **Self-host burden.** Target churches often have no IT staff. The install has
  to be genuinely reliable or a hosted option is needed alongside it.
