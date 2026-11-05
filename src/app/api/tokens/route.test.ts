import { afterAll, describe, expect, it } from "vitest";
import { GET as listTokensRoute, POST as createTokenRoute } from "@/app/api/tokens/route";
import { DELETE as deleteTokenRoute } from "@/app/api/tokens/[id]/route";
import { eq } from "drizzle-orm";
import { createApiToken } from "@/lib/api-tokens";
import { db, closeDb, schema } from "@/lib/db";
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

async function create(cookie: string, over: Record<string, unknown> = {}) {
  const res = await createTokenRoute(
    request("POST", "/api/tokens", {
      cookie,
      body: { name: "Claude Code", scopes: ["read", "write"], ...over },
    }),
    undefined,
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function list(cookie: string) {
  const res = await listTokensRoute(request("GET", "/api/tokens", { cookie }), undefined);
  return (await res.json()) as { tokens: Record<string, unknown>[] };
}

afterAll(async () => {
  await closeDb();
});

describe("tokens API", () => {
  it("creates a token, lists only its prefix and never leaks the secret", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    const created = await create(cookie);
    expect(created.status).toBe(201);
    const { token, prefix, id, scopes } = created.json as {
      token: string;
      prefix: string;
      id: string;
      scopes: string[];
    };
    expect(token).toMatch(/^folio_[A-Za-z0-9]{32}$/);
    expect(token).toHaveLength(38);
    expect(token.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength(12);
    expect(scopes).toEqual(["read", "write"]); // sorted, deduped
    expect(id).toBeTruthy();

    const { tokens } = await list(cookie);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ name: "Claude Code", prefix });
    expect(JSON.stringify(tokens)).not.toContain(token);
  });

  it("accepts duplicate names, rejects empty or unknown scopes", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    expect((await create(cookie)).status).toBe(201);
    expect((await create(cookie)).status).toBe(201); // same name is fine
    expect((await create(cookie, { scopes: [] })).status).toBe(400);
    expect((await create(cookie, { scopes: ["admin"] })).status).toBe(400);
    expect((await create(cookie, { name: "" })).status).toBe(400);
  });

  it("deletes own token with 204, hides foreign ids behind 404", async () => {
    resetRateLimits();
    const a = await signUp();
    const { json } = await create(a.cookie);
    const id = json.id as string;

    const b = await signUp();
    const foreign = await deleteTokenRoute(
      request("DELETE", `/api/tokens/${id}`, { cookie: b.cookie }),
      { params: Promise.resolve({ id }) },
    );
    expect(foreign.status).toBe(404);

    const own = await deleteTokenRoute(
      request("DELETE", `/api/tokens/${id}`, { cookie: a.cookie }),
      {
        params: Promise.resolve({ id }),
      },
    );
    expect(own.status).toBe(204);
    expect((await list(a.cookie)).tokens).toHaveLength(0);
  });

  it("refuses Bearer-authenticated token management", async () => {
    resetRateLimits();
    const { cookie, email } = await signUp();
    const userId = await userIdOf(email);
    const { token } = await createApiToken(userId, "Agent", ["read"]);

    const bearer = request("POST", "/api/tokens", {
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Self-mint", scopes: ["read"] },
    });
    const res = await createTokenRoute(bearer, undefined);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Los tokens no pueden gestionar tokens",
    );
    expect((await list(cookie)).tokens).toHaveLength(1); // nothing was minted
  });

  it("rate-limits creation: 30 per 10 minutes", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    for (let i = 0; i < 30; i++) expect((await create(cookie)).status).toBe(201);
    expect((await create(cookie)).status).toBe(429);
  });
});
