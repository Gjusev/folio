import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

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
