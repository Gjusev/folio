import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** Dimensions of the embedding column (pgvector): the OpenAI-standard 1536.
 *  A model returning another dimensionality is rejected with a clear error in
 *  rag.ts instead of a cryptic INSERT failure. */
export const EMBED_DIMS = 1536;

// node-postgres returns vectors as "[1,2,...]" strings; send them back the same way.
const embedding = customType<{ data: number[]; driverData: string }>({
  dataType: () => `vector(${EMBED_DIMS})`,
  toDriver: (v) => JSON.stringify(v),
  fromDriver: (v) =>
    v
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number),
});

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token; the raw token is never stored.
    id: text().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    mainFile: text("main_file").notNull().default("main.tex"),
    // Steering for the drafting agent: persistent conventions and a writing
    // sample so drafts mimic the author's voice.
    aiInstructions: text("ai_instructions"),
    aiStyleSample: text("ai_style_sample"),
    // Editable section plan produced by the agent (AgentPlan JSON), if any.
    aiPlan: jsonb("ai_plan"),
    // Who may process this manuscript with AI, decided by the owner and
    // enforced server-side for every collaborator's own key:
    // any (any provider) | local (only endpoints on this host's network) | off.
    aiPolicy: text("ai_policy").notNull().default("any"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_owner_idx").on(t.ownerId)],
);

export const files = pgTable(
  "files",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text().notNull(),
    content: text().notNull().default(""),
    // Figures and other binary files; null for text files. Never selected in listings.
    data: bytea("data"),
    size: integer().notNull().default(0),
    // Optimistic concurrency: every save must name the version it was based on.
    version: integer().notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("files_project_path_uq").on(t.projectId, t.path)],
);

export const llmProfiles = pgTable(
  "llm_profiles",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Profiles are per user: no sharing (also the never-share-a-subscription rule).
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text().notNull(),
    // openai (any OpenAI-compatible endpoint) | anthropic (native Messages API)
    kind: text().notNull().default("openai"),
    baseUrl: text("base_url").notNull(),
    // AES-256-GCM sealed with LLM_CREDENTIALS_KEY; null = no auth (local runtimes).
    apiKeyEnc: text("api_key_enc"),
    // Comma-separated model ids, first one is the default. Manual on purpose:
    // auto-fetching model lists from arbitrary gateways is unreliable.
    models: text().notNull().default(""),
    // Optional JSON object merged into the request body (e.g. OpenRouter privacy).
    extraJson: text("extra_json"),
    enabled: boolean().notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("llm_profiles_user_idx").on(t.userId)],
);

export const llmRoutes = pgTable("llm_routes", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  searchProfile: uuid("search_profile").references(() => llmProfiles.id, {
    onDelete: "set null",
  }),
  draftProfile: uuid("draft_profile").references(() => llmProfiles.id, {
    onDelete: "set null",
  }),
  embedProfile: uuid("embed_profile").references(() => llmProfiles.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectFile = typeof files.$inferSelect;

/** One saved version of the project's text files, for diff/restore. */
export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text().notNull(),
    // { [path]: content } for text files only; binaries are recompiled/re-uploaded.
    files: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("snapshots_project_idx").on(t.projectId)],
);

/** Co-authors with access to a project. The owner is not a row here. */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // editor: everything except sharing/deleting. viewer: read + compile + export.
    role: text().notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_members_uq").on(t.projectId, t.userId),
    index("project_members_user_idx").on(t.userId),
  ],
);

/** Persisted assistant/agent turns so conversations survive reloads. */
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // user | assistant
    role: text().notNull(),
    // What produced it: chat | improve | explain | continue | fixlog | draft | plan | rebuttal
    action: text().notNull().default("chat"),
    content: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_messages_project_idx").on(t.projectId, t.createdAt)],
);

/**
 * Append-only ledger of AI use per project: what kind of help, which model,
 * when — never content. Unlike ai_messages (a trimmed chat history) it is not
 * pruned, so the AI-use disclosure can cover the whole life of the manuscript.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // ask | improve | explain | continue | fix | draft | plan | review | image | embed
    action: text().notNull(),
    // Model id as configured by the user (e.g. "mistral-large-latest").
    model: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_project_idx").on(t.projectId, t.createdAt)],
);

/** RAG index: chunks of a project's text files with their embeddings, so the
 *  assistant can answer questions about the user's own .tex/.bib. Rebuilt in
 *  full on every indexing run (no incremental updates by design). */
export const ragChunks = pgTable(
  "rag_chunks",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    file: text().notNull(),
    // Position of the chunk within its file (0-based).
    idx: integer().notNull(),
    content: text().notNull(),
    embedding: embedding("embedding").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rag_chunks_project_idx").on(t.projectId)],
);

/** Third-party integrations (Zotero…); payloads sealed with LLM_CREDENTIALS_KEY. */
export const integrations = pgTable(
  "integrations",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // zotero | …
    kind: text().notNull(),
    // AES-256-GCM sealed JSON ({ apiKey, userId } for zotero).
    dataEnc: text("data_enc").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integrations_user_kind_uq").on(t.userId, t.kind)],
);

/** A saved AI review run, so critiques persist and can be compared over time.
 *  `result` is the Review JSON the model produced; `states` maps a comment
 *  index (as string) to what the author did with it. */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lang: text().notNull(),
    // Aspect[] as JSON: the set the author picked for this run.
    aspects: jsonb().notNull(),
    rigor: text().notNull(),
    focus: text().notNull().default(""),
    result: jsonb().notNull(),
    // { [commentIndex]: "dismissed" | "resolved" }
    states: jsonb().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_project_idx").on(t.projectId, t.createdAt)],
);

/**
 * Personal access tokens ("agent keys"): let the user's own tools (Claude
 * Code, Codex, scripts) talk to Folio's API as them, with a narrower set of
 * permissions than the browser session. Only the SHA-256 hash is stored; the
 * full token is shown exactly once at creation.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    // sha256 hex of the full "folio_…" token.
    tokenHash: text("token_hash").notNull(),
    // First characters, for recognising the row ("folio_ab12…").
    prefix: text().notNull(),
    // Comma-separated subset of TOKEN_SCOPES ("read,write,compile,literature").
    scopes: text().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_tokens_hash_uq").on(t.tokenHash),
    index("api_tokens_user_idx").on(t.userId),
  ],
);

/** Per-user preferences: appearance (theme, fonts, scale) and onboarding
 *  progress. jsonb so new fields need no migration; shapes live in preferences.ts. */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  appearance: jsonb().notNull().default({}),
  onboarding: jsonb().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Threaded review comments, optionally anchored to a span of a file. Replies
 *  reference a root comment (parentId null); deleting a root cascades. */
export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    // UTF-16 code-unit offsets into the file content at comment time; the quote
    // lets the anchor be relocated when the file is edited.
    anchorStart: integer("anchor_start"),
    anchorEnd: integer("anchor_end"),
    anchorQuote: text("anchor_quote"),
    body: text().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_project_idx").on(t.projectId, t.createdAt)],
);

/** A paper the user uploaded to their personal library (PDF). `data` is the
 *  original file; `fullText` the extracted text (null while extraction failed)
 *  — both never selected in listings. */
export const libraryPapers = pgTable(
  "library_papers",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    filename: text().notNull(),
    size: integer().notNull(),
    pages: integer(),
    data: bytea("data").notNull(),
    fullText: text("full_text"),
    doi: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("library_papers_user_idx").on(t.userId, t.createdAt)],
);

/** Which library paper is attached to which project. The PK makes re-attaching
 *  a no-op; rows cascade away with either side. */
export const libraryProjectLinks = pgTable(
  "library_project_links",
  {
    paperId: uuid("paper_id")
      .notNull()
      .references(() => libraryPapers.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.paperId, t.projectId] })],
);
