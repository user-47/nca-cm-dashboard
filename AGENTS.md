# AGENTS.md

Working notes for this repo. Read before changing code.

## What this is

A self-hostable dashboard a church creative media team uses to produce voiceovers,
announcement videos, posters, sermon Shorts, and delayed French translation. Built for
New Covenant Assembly first, packaged so other churches can run it later.

## Shape of the repo

npm workspaces. The dashboard is the root package; new services and shared code sit
alongside it.

```
src/                    the dashboard (Next 14, App Router)
packages/brand-tokens   shared brand schema + seed data (framework-free)
packages/render-client  typed client for render-api
services/templates      Next 15 visual layer, screenshotted by Playwright
services/render-api     Fastify + Playwright, writes PNGs to MinIO
n8n/                    pipeline workflows and the FFmpeg render script
drizzle/                generated SQL migrations
docs/poster-creator/    design notes for the poster feature
```

Run `npm install` from the root. Workspace packages export TypeScript **source**, not
built output, so consumers transpile them: `transpilePackages` in Next, `tsx`/`tsc` in
render-api.

## Two things that are always true

**The app owns state; pipelines report.** The database is the single source of truth for
job status. n8n and render-api tell the app what happened; they never hold state the app
needs.

**Nothing large travels through a webhook.** Browsers upload straight to MinIO on a
presigned PUT. Services exchange object keys and presigned URLs, never bytes.

## Conventions

- TypeScript strict. No `any` without an eslint-disable and a reason.
- Zod at every boundary: HTTP bodies, JSON DB columns, template params, external API
  responses.
- kebab-case for URLs, files, and template ids. camelCase in TypeScript. snake_case for
  DB columns.
- Every call out to Playwright, MinIO, n8n, or Anthropic gets an explicit timeout and
  logs enough context to reproduce the failure.

### Colour and type

Every colour and font is a CSS custom property. Nothing is hardcoded in a component, so
a church rebrands by changing data. Tailwind colours resolve through `color-mix()` so
opacity modifiers (`text-ink-muted/60`) work against `var()` tokens — see
`tailwind.config.ts`.

Fonts are self-hosted. Never fetch a font over the network at render time: a Playwright
screenshot will race the request and ship a fallback face. Wait on `document.fonts.ready`
and on every `<img>` reaching `complete` before screenshotting.

### Copy

Product copy is written for a volunteer, not a developer. Sentence case. Active voice. A
button says what happens ("Create announcement", not "Submit"). Errors state what went
wrong and how to fix it, with no apology. No em-dashes, no marketing filler, no emoji.
Name things by what the person controls ("Voice", not "TTS provider config").

## Auth

Argon2id hashes, signed httpOnly session cookie, roles `admin | editor | reviewer`.
`requireUser()` returns the person and their `orgId`. **Every query is org-scoped** —
that scoping is the tenant boundary, so a new table without `org_id` is a bug.

The session cookie is only marked `Secure` when `PUBLIC_URL` is https, because a Secure
cookie sent over plain HTTP is silently dropped and sign-in appears to do nothing. Many
churches will run this on a plain-HTTP LAN address.

## Poster Creator

Renders a poster PNG from a brand (design tokens), a template (layout), and params
(user text and images).

- `services/templates` is a pure visual layer: no auth, no middleware, no redirects,
  because Playwright must be able to fetch `/render/[brandId]/[template]?params` and get
  markup. Iterate against it directly in a browser.
- `services/render-api` owns Playwright. The dashboard never runs a browser itself.
- The dashboard calls render-api **server-side only**, so render-api needs no public port.

Rules specific to this feature:

- **Brands are org-scoped** (`brands.org_id`). A global brand table would let one church
  render with another's identity.
- `orgs.theme_json` themes the dashboard chrome. `brands.tokens` is the poster design
  system. They are deliberately separate.
- **Templates declare their slots** in `meta.ts`. The dashboard generates the form from
  those slots. Never hardcode a form per template.
- **Renders are deterministic.** The same poster id and params must produce byte-identical
  PNGs. Nothing time-based, random, or network-dependent inside a template.
- Poster output goes to the existing `nca-media` bucket under `posters/`; uploaded
  references under `refs/`. Reads are presigned; the bucket is not public.

## Local commands

```bash
npm run dev            # dashboard on :3000
npm run typecheck
npm run db:generate    # after editing src/db/schema.ts
npm run db:migrate
npm run db:seed

docker compose up -d
docker compose run --rm seed
```

Ports: 3000 dashboard, 3100 templates, 3200 render-api, 5678 n8n, 9000/9001 MinIO,
5432 Postgres (loopback only).

The repo path contains a space. Quote it: `cd "E:\NCA Creative Media Dashboard"`.

## Announcement audio

Two paths, and which one is in play is decided by whether the announcement has a
narration asset. There is no separate mode flag, because a flag can disagree with
the thing it describes.

- **A file per section** — recorded or generated. A section's length is a probe
  of its own audio.
- **One recording for the whole video** — sections carry `start_ms` and
  `duration_ms` offsets into it. Boundaries come from the pauses, disambiguated by
  how much script each section carries, and are draggable on the strip.

Never split a narration into per-section files. Per-clip loudness normalisation
is right for clips of mixed provenance and wrong for slices of one continuous
read, where it pumps across the person's own sentences.

`duration_ms` means different things on the two paths — a span of the recording,
or the length of a section's own file — so anything that clears a narration has
to put the per-section timings back.

## Later, deliberately not now

Batch rendering (CSV to N posters), scheduled renders, a template marketplace, an
in-dashboard template editor. Brand admin polish, multi-user roles, activity log, MinIO
explorer. Single-tenant church packaging: `compose.church.yml`, Caddy SSL, a first-boot
wizard, image publishing on git tag. TTS narration over posters, poster-to-Shorts
animation, French translation.
