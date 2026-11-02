import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ------------------------------------------------------------------ enums */

export const userRole = pgEnum("user_role", ["admin", "editor", "reviewer"]);
export const projectKind = pgEnum("project_kind", [
  "announcement",
  "shorts",
  "poster",
  "translation",
]);
export const assetKind = pgEnum("asset_kind", [
  "audio",
  "image",
  "video",
  "poster",
]);
export const announcementStatus = pgEnum("announcement_status", [
  "draft",
  "ready",
  "rendering",
  "complete",
  "failed",
]);
export const audioSource = pgEnum("audio_source", ["recorded", "tts"]);
export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "awaiting_review",
  "rendering",
  "complete",
  "failed",
]);
export const jobType = pgEnum("job_type", [
  "voiceover",
  "announcement_assembly",
  "poster_render",
  "shorts_extract",
  "shorts_render",
  "translation_chunk",
]);
export const shortsDecision = pgEnum("shorts_decision", [
  "pending",
  "approved",
  "rejected",
]);
export const xlateSessionStatus = pgEnum("xlate_session_status", [
  "live",
  "ended",
]);
export const xlateChunkState = pgEnum("xlate_chunk_state", [
  "captured",
  "transcribed",
  "translated",
  "spoken",
  "failed",
]);
export const voiceProvider = pgEnum("voice_provider", ["kokoro", "fish"]);

/* ----------------------------------------------------------------- tables */

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Overrides for the default theme tokens. Empty object means "use defaults".
  themeJson: jsonb("theme_json").$type<Record<string, string>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    orgIdx: index("users_org_idx").on(t.orgId),
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  })
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: projectKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("projects_org_idx").on(t.orgId),
  })
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    // Object key inside the MinIO bucket. Bytes never travel through the app.
    minioKey: text("minio_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes"),
    // durationMs, width, height, and anything else a pipeline probes.
    metaJson: jsonb("meta_json").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("assets_org_idx").on(t.orgId),
    keyIdx: uniqueIndex("assets_key_idx").on(t.minioKey),
  })
);

export const voices = pgTable(
  "voices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // What the person sees. The provider is an implementation detail.
    name: text("name").notNull(),
    provider: voiceProvider("provider").notNull(),
    // Provider-side identifier: a Kokoro voice name, a Fish model id.
    providerVoiceId: text("provider_voice_id").notNull(),
    language: text("language").notNull().default("en"),
    isDefault: boolean("is_default").notNull().default(false),
    settingsJson: jsonb("settings_json").$type<Record<string, unknown>>().default({}).notNull(),
    sampleAssetId: uuid("sample_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("voices_org_idx").on(t.orgId),
  })
);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    introAssetId: uuid("intro_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    outroAssetId: uuid("outro_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    /**
     * One recording covering every section, instead of one file per section.
     *
     * Its presence is what puts an announcement in narration mode — there is no
     * separate mode flag, because a flag can disagree with the asset it
     * describes. Sections then carry offsets into this file rather than audio of
     * their own, and the recording is never split: normalising slices of one
     * continuous read independently pumps audibly across the person's own
     * sentences.
     */
    narrationAssetId: uuid("narration_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    status: announcementStatus("status").notNull().default("draft"),
    renderedAssetId: uuid("rendered_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    projectIdx: index("announcements_project_idx").on(t.projectId),
  })
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull().default(""),
    posterAssetId: uuid("poster_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    audioSource: audioSource("audio_source").notNull().default("tts"),
    audioAssetId: uuid("audio_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    // Resolved by ffprobe (upload) or by the voiceover sub-workflow (tts).
    // Null means "the Section Strip does not know this card's width yet".
    durationMs: integer("duration_ms"),
    /**
     * Where this section begins inside the announcement's narration, when one is
     * set. Null on the per-section audio path, where a section's audio starts at
     * its own zero.
     *
     * Boundaries partition the recording exactly: section 1 starts at 0, each
     * later section starts where the previous one ended, and the last ends at
     * the recording's end. Nothing drifts, so no reconciliation rule is needed.
     */
    startMs: integer("start_ms"),
    voiceId: uuid("voice_id").references(() => voices.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    announcementIdx: index("sections_announcement_idx").on(t.announcementId),
    positionIdx: uniqueIndex("sections_position_idx").on(t.announcementId, t.position),
  })
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    type: jobType("type").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    // What the app handed to n8n.
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().default({}).notNull(),
    // What n8n handed back.
    resultJson: jsonb("result_json").$type<Record<string, unknown>>().default({}).notNull(),
    // 0..100, reported by pipeline callbacks. Drives the job card.
    progress: integer("progress").notNull().default(0),
    // Human-readable step name, e.g. "Rendering section 3 of 5".
    stepLabel: text("step_label"),
    errorText: text("error_text"),
    // n8n resume URL, set when a pipeline parks on a Wait node.
    resumeUrl: text("resume_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("jobs_org_idx").on(t.orgId),
    projectIdx: index("jobs_project_idx").on(t.projectId),
    statusIdx: index("jobs_status_idx").on(t.status),
  })
);

export const shortsCands = pgTable(
  "shorts_cands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    sourceAssetId: uuid("source_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    transcript: text("transcript").notNull(),
    hook: text("hook"),
    caption: text("caption"),
    rationale: text("rationale"),
    rank: integer("rank").notNull().default(0),
    decision: shortsDecision("decision").notNull().default("pending"),
    renderedAssetId: uuid("rendered_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    jobIdx: index("shorts_cands_job_idx").on(t.jobId),
  })
);

/* ------------------------------------------------------- poster creator */

/**
 * A brand is the design system a poster is rendered with: colours, type,
 * corner radii, decorative motifs. Deliberately a row rather than a code
 * module, so another church is data rather than a deploy.
 *
 * Org-scoped, not global. Org scoping is this app's whole tenant boundary, and
 * a global brand table would let one church render in another's identity. It
 * also makes "save these extracted tokens as a new brand" mean what a person
 * expects, rather than "create a new church".
 */
export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // Validated by the brandTokens schema in @nca/brand-tokens.
    tokensJson: jsonb("tokens_json").$type<Record<string, unknown>>().notNull(),
    logoAssetId: uuid("logo_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("brands_org_idx").on(t.orgId),
    // Slugs appear in render URLs, so they need only be unique per church.
    slugIdx: uniqueIndex("brands_org_slug_idx").on(t.orgId, t.slug),
  })
);

/**
 * A template is a layout. The row is a registration of something that exists
 * in code: the component lives in services/templates, and this table records
 * its slots so the dashboard can build a form without knowing the template.
 *
 * Global rather than org-scoped, because templates ship with the product.
 * Keyed by id and version together so v1 can stay renderable after v2 lands
 * and existing posters keep producing the picture they always did.
 */
export const templates = pgTable(
  "templates",
  {
    id: text("id").notNull(),
    version: text("version").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // TemplateMeta['slots'] from @nca/brand-tokens.
    slotsJson: jsonb("slots_json").$type<Array<Record<string, unknown>>>().notNull(),
    supportedRatios: jsonb("supported_ratios").$type<string[]>().notNull(),
    previewAssetId: uuid("preview_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id, t.version] }),
  })
);

/**
 * A poster is the saved recipe: which brand, which template version, what the
 * person typed, at what size. Rendering is a separate act, so a poster can be
 * re-rendered later and produce the same picture.
 *
 * No org_id of its own. It reaches the org through its brand, which is one
 * join and makes it structurally impossible for a poster to belong to a
 * different church than the brand it is drawn with.
 */
export const posters = pgTable(
  "posters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    templateVersion: text("template_version").notNull(),
    name: text("name"),
    // Slot values, validated against the template's own slots at render time.
    paramsJson: jsonb("params_json").$type<Record<string, unknown>>().default({}).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    brandIdx: index("posters_brand_idx").on(t.brandId),
    templateFk: foreignKey({
      columns: [t.templateId, t.templateVersion],
      foreignColumns: [templates.id, templates.version],
      name: "posters_template_fk",
    }),
  })
);

/**
 * One row per time a poster was actually drawn.
 *
 * The PNG itself becomes an ordinary `assets` row with kind 'poster', which
 * means it is immediately usable as a section poster in the announcement
 * builder and is served through the same presigned-URL path as everything
 * else. No second storage concept, and no stored URL to go stale.
 */
export const renders = pgTable(
  "renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    posterId: uuid("poster_id")
      .notNull()
      .references(() => posters.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    renderMs: integer("render_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    posterIdx: index("renders_poster_idx").on(t.posterId),
  })
);

/**
 * A poster someone uploaded as a style reference, plus whatever Claude read
 * out of it. Kept even after a brand is created from it, so the suggestion can
 * be revisited and so a bad extraction can be diagnosed against its source.
 */
export const referencePosters = pgTable(
  "reference_posters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // Null until extraction finishes. Shaped like brandTokens on success.
    extractedTokens: jsonb("extracted_tokens").$type<Record<string, unknown>>(),
    // Set when extraction failed, so the UI can say what went wrong.
    errorText: text("error_text"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("reference_posters_org_idx").on(t.orgId),
  })
);

export const xlateSessions = pgTable(
  "xlate_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    status: xlateSessionStatus("status").notNull().default("live"),
    sourceLang: text("source_lang").notNull().default("en"),
    targetLang: text("target_lang").notNull().default("fr"),
    voiceId: uuid("voice_id").references(() => voices.id, { onDelete: "set null" }),
    glossaryJson: jsonb("glossary_json")
      .$type<Array<{ term: string; translation: string; note?: string }>>()
      .default([])
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("xlate_sessions_org_idx").on(t.orgId),
  })
);

export const xlateChunks = pgTable(
  "xlate_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => xlateSessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    sourceText: text("source_text"),
    targetText: text("target_text"),
    audioAssetId: uuid("audio_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    state: xlateChunkState("state").notNull().default("captured"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index("xlate_chunks_session_idx").on(t.sessionId),
    seqIdx: uniqueIndex("xlate_chunks_seq_idx").on(t.sessionId, t.seq),
  })
);

/* -------------------------------------------------------------- relations */

export const orgsRelations = relations(orgs, ({ many }) => ({
  users: many(users),
  projects: many(projects),
  assets: many(assets),
  voices: many(voices),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  org: one(orgs, { fields: [users.orgId], references: [orgs.id] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  org: one(orgs, { fields: [projects.orgId], references: [orgs.id] }),
  announcements: many(announcements),
  jobs: many(jobs),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  project: one(projects, {
    fields: [announcements.projectId],
    references: [projects.id],
  }),
  intro: one(assets, {
    fields: [announcements.introAssetId],
    references: [assets.id],
    relationName: "announcement_intro",
  }),
  outro: one(assets, {
    fields: [announcements.outroAssetId],
    references: [assets.id],
    relationName: "announcement_outro",
  }),
  narration: one(assets, {
    fields: [announcements.narrationAssetId],
    references: [assets.id],
    relationName: "announcement_narration",
  }),
  rendered: one(assets, {
    fields: [announcements.renderedAssetId],
    references: [assets.id],
    relationName: "announcement_rendered",
  }),
  sections: many(sections),
}));

export const sectionsRelations = relations(sections, ({ one }) => ({
  announcement: one(announcements, {
    fields: [sections.announcementId],
    references: [announcements.id],
  }),
  poster: one(assets, {
    fields: [sections.posterAssetId],
    references: [assets.id],
    relationName: "section_poster",
  }),
  audio: one(assets, {
    fields: [sections.audioAssetId],
    references: [assets.id],
    relationName: "section_audio",
  }),
  voice: one(voices, { fields: [sections.voiceId], references: [voices.id] }),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  org: one(orgs, { fields: [jobs.orgId], references: [orgs.id] }),
  project: one(projects, { fields: [jobs.projectId], references: [projects.id] }),
  candidates: many(shortsCands),
}));

export const brandsRelations = relations(brands, ({ one, many }) => ({
  org: one(orgs, { fields: [brands.orgId], references: [orgs.id] }),
  logo: one(assets, { fields: [brands.logoAssetId], references: [assets.id] }),
  posters: many(posters),
}));

export const postersRelations = relations(posters, ({ one, many }) => ({
  brand: one(brands, { fields: [posters.brandId], references: [brands.id] }),
  author: one(users, { fields: [posters.createdBy], references: [users.id] }),
  renders: many(renders),
}));

export const rendersRelations = relations(renders, ({ one }) => ({
  poster: one(posters, { fields: [renders.posterId], references: [posters.id] }),
  asset: one(assets, { fields: [renders.assetId], references: [assets.id] }),
}));

export const referencePostersRelations = relations(referencePosters, ({ one }) => ({
  org: one(orgs, { fields: [referencePosters.orgId], references: [orgs.id] }),
  asset: one(assets, { fields: [referencePosters.assetId], references: [assets.id] }),
  uploader: one(users, {
    fields: [referencePosters.uploadedBy],
    references: [users.id],
  }),
}));

export const voicesRelations = relations(voices, ({ one }) => ({
  org: one(orgs, { fields: [voices.orgId], references: [orgs.id] }),
  sample: one(assets, { fields: [voices.sampleAssetId], references: [assets.id] }),
}));

/* ------------------------------------------------------------------ types */

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Voice = typeof voices.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobStatus = (typeof jobStatus.enumValues)[number];
export type JobType = (typeof jobType.enumValues)[number];
export type ShortsCandidate = typeof shortsCands.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Poster = typeof posters.$inferSelect;
export type Render = typeof renders.$inferSelect;
export type ReferencePoster = typeof referencePosters.$inferSelect;
