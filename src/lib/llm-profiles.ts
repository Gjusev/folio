import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { seal, sealConfigured, unseal } from "@/lib/sealed";

/** Everything a call needs; the streaming client never knows where it came from. */
export type Endpoint = {
  id: string;
  label: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
  extra: Record<string, unknown>;
};

export { PRESETS } from "@/lib/llm-presets";
export type { Profile, Task } from "@/lib/llm-presets";
import type { Profile, Task } from "@/lib/llm-presets";

const ENV_ID = "env";

function envProfile(): Profile | null {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = env();
  if (!LLM_BASE_URL || !LLM_MODEL) return null;
  return {
    id: ENV_ID,
    label: LLM_MODEL.split("/").pop() ?? LLM_MODEL,
    kind: "openai",
    baseUrl: LLM_BASE_URL,
    hasKey: Boolean(LLM_API_KEY),
    models: [LLM_MODEL],
    extra: {},
    enabled: true,
    readonly: true,
  };
}

function toProfile(row: typeof schema.llmProfiles.$inferSelect): Profile {
  let extra: Record<string, unknown> = {};
  try {
    if (row.extraJson) extra = JSON.parse(row.extraJson) as Record<string, unknown>;
  } catch {
    // Stored extra was validated on write; ignore malformed legacy rows.
  }
  return {
    id: row.id,
    label: row.label,
    kind: row.kind === "anthropic" ? "anthropic" : "openai",
    baseUrl: row.baseUrl,
    hasKey: Boolean(row.apiKeyEnc),
    models: row.models
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    extra,
    enabled: row.enabled,
    readonly: false,
  };
}

export async function listProfiles(userId: string): Promise<Profile[]> {
  const rows = await db()
    .select()
    .from(schema.llmProfiles)
    .where(eq(schema.llmProfiles.userId, userId));
  const own = rows.map(toProfile);
  const fromEnv = envProfile();
  return fromEnv ? [...own, fromEnv] : own;
}

/** https for remote endpoints; plain HTTP only on loopback (local runtimes). */
export function validateBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "La URL base no es válida");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1", "host.docker.internal"].some(
    (h) => url.hostname === h || url.hostname.endsWith(".local"),
  );
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    throw new HttpError(400, "Las URL remotas deben ser HTTPS; HTTP solo en localhost");
  if (url.username || url.password || url.search || url.hash)
    throw new HttpError(400, "La URL no puede incluir credenciales ni parámetros");
  return url;
}

export type ProfileInput = {
  label: string;
  kind: string;
  baseUrl: string;
  apiKey?: string; // omitted/undefined on PATCH = keep the stored one
  models: string;
  extraJson?: string | null;
  enabled?: boolean;
};

function parseInput(input: ProfileInput) {
  const label = input.label.trim();
  if (!label || label.length > 60) throw new HttpError(400, "Pon un nombre de hasta 60 caracteres");
  const kind = input.kind === "anthropic" ? "anthropic" : "openai";
  const baseUrl = validateBaseUrl(input.baseUrl.trim().replace(/\/+$/, ""))
    .toString()
    .replace(/\/+$/, "");
  const models = input.models
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (models.length === 0) throw new HttpError(400, "Indica al menos un modelo");
  let extraJson: string | null = null;
  if (input.extraJson && input.extraJson.trim()) {
    try {
      const parsed = JSON.parse(input.extraJson) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        throw new Error("not an object");
      extraJson = JSON.stringify(parsed);
    } catch {
      throw new HttpError(400, "El JSON extra no es un objeto válido");
    }
  }
  return { label, kind, baseUrl, models: models.join(","), extraJson };
}

export async function createProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const parsed = parseInput(input);
  if (input.apiKey && !sealConfigured())
    throw new HttpError(400, "Para guardar claves API define LLM_CREDENTIALS_KEY en el servidor");
  const [row] = await db()
    .insert(schema.llmProfiles)
    .values({
      userId,
      ...parsed,
      apiKeyEnc: input.apiKey ? seal(input.apiKey) : null,
    })
    .returning();
  return toProfile(row);
}

export async function updateProfile(
  userId: string,
  id: string,
  input: ProfileInput,
): Promise<Profile> {
  if (id === ENV_ID) throw new HttpError(403, "El perfil heredado del .env es de solo lectura");
  const parsed = parseInput(input);
  if (input.apiKey && !sealConfigured())
    throw new HttpError(400, "Para guardar claves API define LLM_CREDENTIALS_KEY en el servidor");
  const [row] = await db()
    .update(schema.llmProfiles)
    .set({
      ...parsed,
      ...(input.apiKey !== undefined
        ? { apiKeyEnc: input.apiKey ? seal(input.apiKey) : null }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    })
    .where(and(eq(schema.llmProfiles.id, id), eq(schema.llmProfiles.userId, userId)))
    .returning();
  if (!row) throw new HttpError(404, "Perfil no encontrado");
  return toProfile(row);
}

export async function deleteProfile(userId: string, id: string): Promise<void> {
  if (id === ENV_ID) throw new HttpError(403, "El perfil heredado del .env es de solo lectura");
  const rows = await db()
    .delete(schema.llmProfiles)
    .where(and(eq(schema.llmProfiles.id, id), eq(schema.llmProfiles.userId, userId)))
    .returning({ id: schema.llmProfiles.id });
  if (!rows.length) throw new HttpError(404, "Perfil no encontrado");
}

export async function getRoutes(userId: string) {
  const [row] = await db()
    .select()
    .from(schema.llmRoutes)
    .where(eq(schema.llmRoutes.userId, userId))
    .limit(1);
  return {
    search: row?.searchProfile ?? null,
    draft: row?.draftProfile ?? null,
    embed: row?.embedProfile ?? null,
  };
}

export async function setRoutes(
  userId: string,
  routes: { search?: string | null; draft?: string | null; embed?: string | null },
) {
  // Every referenced profile must belong to the user (or be the env profile).
  const owned = new Set(
    (
      await db()
        .select({ id: schema.llmProfiles.id })
        .from(schema.llmProfiles)
        .where(eq(schema.llmProfiles.userId, userId))
    ).map((r) => r.id),
  );
  const check = (id: string | null | undefined) => {
    if (id === null || id === undefined) return null;
    // The env profile is the automatic fallback, not a routable id (the column
    // is a uuid); "default" in the UI already resolves to it.
    if (id === ENV_ID)
      throw new HttpError(
        400,
        "El perfil del .env se usa como respaldo; elige Predeterminado o uno propio",
      );
    if (!owned.has(id)) throw new HttpError(400, "Perfil desconocido");
    return id;
  };
  const values = {
    userId,
    searchProfile: check(routes.search),
    draftProfile: check(routes.draft),
    embedProfile: check(routes.embed),
    updatedAt: new Date(),
  };
  await db().insert(schema.llmRoutes).values(values).onConflictDoUpdate({
    target: schema.llmRoutes.userId,
    set: values,
  });
}

function endpointOf(p: Profile, apiKey: string): Endpoint {
  return {
    id: p.id,
    label: p.label,
    kind: p.kind,
    baseUrl: p.baseUrl,
    apiKey,
    model: p.models[0] ?? "",
    extra: p.extra,
  };
}

/**
 * Resolution order for a task: the user's routed profile, then their first
 * enabled profile, then the .env endpoint (what the app had before profiles).
 */
export async function resolveEndpoint(userId: string, task: Task): Promise<Endpoint | null> {
  const routes = await getRoutes(userId);
  const routed = routes[task];
  if (routed) {
    const [row] = await db()
      .select()
      .from(schema.llmProfiles)
      .where(and(eq(schema.llmProfiles.id, routed), eq(schema.llmProfiles.userId, userId)))
      .limit(1);
    if (row && row.enabled)
      return endpointOf(toProfile(row), row.apiKeyEnc ? unseal(row.apiKeyEnc) : "");
  }
  // Fallback chain: oldest enabled profile (deterministic), then .env.
  const [first] = await db()
    .select()
    .from(schema.llmProfiles)
    .where(and(eq(schema.llmProfiles.userId, userId), eq(schema.llmProfiles.enabled, true)))
    .orderBy(schema.llmProfiles.createdAt)
    .limit(1);
  if (first) return endpointOf(toProfile(first), first.apiKeyEnc ? unseal(first.apiKeyEnc) : "");
  const fromEnv = envProfile();
  if (!fromEnv) return null;
  const { LLM_API_KEY } = env();
  return endpointOf(fromEnv, LLM_API_KEY);
}

/** Used by pages/routes to decide whether the assistant is available at all. */
export async function anyEndpoint(userId: string): Promise<boolean> {
  return (await resolveEndpoint(userId, "draft")) !== null;
}
