import { afterAll, describe, expect, it, vi } from "vitest";
import { GET as listProfilesRoute, POST as createProfileRoute } from "@/app/api/llm/profiles/route";
import {
  DELETE as deleteProfileRoute,
  PATCH as updateProfileRoute,
} from "@/app/api/llm/profiles/[id]/route";
import { POST as testProviderRoute } from "@/app/api/llm/test/route";
import { GET as getRouting, PUT as putRouting } from "@/app/api/llm/routing/route";
import { eq } from "drizzle-orm";
import { db, closeDb, schema } from "@/lib/db";
import { resolveEndpoint } from "@/lib/llm-profiles";
import { resetRateLimits } from "@/lib/rate-limit";
import { request, signUp } from "../../../../test/helpers";

async function userIdOf(email: string): Promise<string> {
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return row.id;
}

vi.hoisted(() => {
  process.env.LLM_CREDENTIALS_KEY = "t".repeat(64);
  // No .env endpoint in this worker: profiles come from the DB only.
  process.env.LLM_BASE_URL = "";
  process.env.LLM_MODEL = "";
  // The Ollama-style local profile below is legit in tests.
  process.env.LLM_ALLOW_LOCAL = "1";
});

// validateBaseUrl resolves hostnames to reject private networks (SSRF); in
// tests every hostname resolves to a public address and literals to
// themselves, mirroring the table in llm-profiles.test.ts.
vi.mock("node:dns/promises", () => {
  const isIP = (s: string) => (/^\d+\.\d+\.\d+\.\d+$/.test(s) ? 4 : s.includes(":") ? 6 : 0);
  return {
    lookup: (host: string) => {
      const bare = host.replace(/^\[|\]$/g, "");
      const own = isIP(bare);
      if (own) return Promise.resolve([{ address: bare, family: own }]);
      if (bare === "localhost") return Promise.resolve([{ address: "127.0.0.1", family: 4 }]);
      return Promise.resolve([{ address: "93.184.216.34", family: 4 }]);
    },
  };
});

afterAll(async () => {
  await closeDb();
});

const mistral = {
  label: "Mistral",
  kind: "openai",
  baseUrl: "https://api.mistral.ai/v1",
  apiKey: "sk-test-1",
  models: "mistral-small-latest, mistral-large-latest",
};

async function createProfile(cookie: string, over: Record<string, unknown> = {}) {
  const res = await createProfileRoute(
    request("POST", "/api/llm/profiles", { cookie, body: { ...mistral, ...over } }),
    undefined,
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("llm profiles API", () => {
  it("creates, lists and never leaks the key", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    const created = await createProfile(cookie);
    expect(created.status).toBe(201);
    expect(created.json.profile).toMatchObject({
      label: "Mistral",
      hasKey: true,
      models: ["mistral-small-latest", "mistral-large-latest"],
      readonly: false,
    });

    const list = await listProfilesRoute(
      request("GET", "/api/llm/profiles", { cookie }),
      undefined,
    );
    const { profiles } = (await list.json()) as { profiles: unknown[] };
    expect(profiles).toHaveLength(1);
    expect(JSON.stringify(profiles)).not.toContain("sk-test-1");
  });

  it("validates URLs: https remote, http loopback only, no embedded credentials", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    expect((await createProfile(cookie, { baseUrl: "http://api.mistral.ai/v1" })).status).toBe(400);
    expect((await createProfile(cookie, { baseUrl: "https://u:p@api.mistral.ai/v1" })).status).toBe(
      400,
    );
    expect((await createProfile(cookie, { models: "" })).status).toBe(400);
    const local = await createProfile(cookie, {
      label: "Ollama",
      baseUrl: "http://localhost:11434/v1",
      models: "qwen3:4b",
      apiKey: "",
    });
    expect(local.status).toBe(201);
  });

  it("patches keeping the stored key when apiKey is omitted", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    const { json } = await createProfile(cookie);
    const id = (json.profile as { id: string }).id;
    const patched = await updateProfileRoute(
      request("PATCH", `/api/llm/profiles/${id}`, {
        cookie,
        body: {
          label: "Mistral 2",
          kind: "openai",
          baseUrl: "https://api.mistral.ai/v1",
          models: "mistral-small-latest",
        },
      }),
      { params: Promise.resolve({ id }) },
    );
    const body = (await patched.json()) as { profile: { label: string; hasKey: boolean } };
    expect(body.profile).toMatchObject({ label: "Mistral 2", hasKey: true });
  });

  it("scopes profiles per user and protects the env profile", async () => {
    resetRateLimits();
    const a = await signUp();
    const { json } = await createProfile(a.cookie);
    const id = (json.profile as { id: string }).id;
    const b = await signUp();

    const foreignPatch = await updateProfileRoute(
      request("PATCH", `/api/llm/profiles/${id}`, {
        cookie: b.cookie,
        body: { label: "X", kind: "openai", baseUrl: "https://api.mistral.ai/v1", models: "m" },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(foreignPatch.status).toBe(404);

    const foreignDelete = await deleteProfileRoute(
      request("DELETE", `/api/llm/profiles/${id}`, { cookie: b.cookie }),
      { params: Promise.resolve({ id }) },
    );
    expect(foreignDelete.status).toBe(404);

    const envPatch = await updateProfileRoute(
      request("PATCH", "/api/llm/profiles/env", {
        cookie: a.cookie,
        body: { label: "X", kind: "openai", baseUrl: "https://api.mistral.ai/v1", models: "m" },
      }),
      { params: Promise.resolve({ id: "env" }) },
    );
    expect(envPatch.status).toBe(403);
  });

  it("test route refuses non-https internal URLs (SSRF guard)", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    for (const baseUrl of ["http://169.254.169.254/latest", "http://10.0.0.5:9200", "ftp://x/y"]) {
      const res = await testProviderRoute(
        request("POST", "/api/llm/test", {
          cookie,
          body: { kind: "openai", baseUrl, apiKey: "", model: "x" },
        }),
        undefined,
      );
      expect(res.status).toBe(400);
    }
  });

  it("resolves endpoints: routed profile, then first enabled, with key unsealed", async () => {
    resetRateLimits();
    const { cookie, email } = await signUp();
    const userId = await userIdOf(email);
    expect(await resolveEndpoint(userId, "draft")).toBeNull();

    const strong = await createProfile(cookie, {
      label: "Strong",
      baseUrl: "https://api.deepseek.com",
      models: "deepseek-chat",
      apiKey: "sk-strong",
    });
    const cheap = await createProfile(cookie, {
      label: "Cheap",
      baseUrl: "http://localhost:11434/v1",
      models: "qwen3:0.6b",
      apiKey: "",
    });
    const strongId = (strong.json.profile as { id: string }).id;
    const cheapId = (cheap.json.profile as { id: string }).id;

    // No routes yet: oldest enabled profile wins (deterministic order).
    const first = await resolveEndpoint(userId, "draft");
    expect(first).toMatchObject({ label: "Strong", apiKey: "sk-strong", model: "deepseek-chat" });

    const put = await putRouting(
      request("PUT", "/api/llm/routing", {
        cookie,
        body: { search: cheapId, draft: strongId, embed: null },
      }),
      undefined,
    );
    expect(put.status).toBe(200);
    expect(
      await getRouting(request("GET", "/api/llm/routing", { cookie }), undefined).then((r) =>
        r.json(),
      ),
    ).toMatchObject({ search: cheapId, draft: strongId, embed: null });

    expect(await resolveEndpoint(userId, "search")).toMatchObject({ label: "Cheap", apiKey: "" });
    expect(await resolveEndpoint(userId, "draft")).toMatchObject({ apiKey: "sk-strong" });

    // The env profile is not a routable id (uuid column; it is the fallback).
    const envRoute = await putRouting(
      request("PUT", "/api/llm/routing", {
        cookie,
        body: { search: "env", draft: strongId, embed: null },
      }),
      undefined,
    );
    expect(envRoute.status).toBe(400);

    // Unknown/foreign profile id in routing is rejected.
    const bad = await putRouting(
      request("PUT", "/api/llm/routing", {
        cookie,
        body: { search: "00000000-0000-0000-0000-000000000000", draft: strongId, embed: null },
      }),
      undefined,
    );
    expect(bad.status).toBe(400);

    // Deleting a routed profile leaves the route null (FK set null), resolution falls back.
    const del = await deleteProfileRoute(
      request("DELETE", `/api/llm/profiles/${cheapId}`, { cookie }),
      { params: Promise.resolve({ id: cheapId }) },
    );
    expect(del.status).toBe(204);
    expect(await resolveEndpoint(userId, "search")).toMatchObject({ label: "Strong" });
  });
});
