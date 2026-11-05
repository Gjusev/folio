import { request, expect, type APIRequestContext, type Page } from "@playwright/test";

export type Ctx = { cookie: string; api: APIRequestContext; projectId: string; mainId: string };

const BASE = () => process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
let n = 0;

/** Fresh account + project with the article template; returns session cookie.
 *  Falls back to a persistent local account when the register rate-limit
 *  (rightly) kicks in across repeated e2e runs. */
export async function seed(): Promise<Ctx> {
  const api = await request.newContext({ baseURL: BASE() });
  const email = `e2e-${Date.now()}-${n++}@t.dev`;
  let cookie: string;
  // Prefer the persistent account: each spec needs a session, not a fresh
  // user, and the register endpoint allows only 10 sign-ups per IP per hour —
  // a full suite that registers per spec exhausts it and breaks the two
  // onboarding specs, which must exercise the real sign-up form. Only specs
  // that test registration itself (onboarding) spend quota.
  const known = process.env.E2E_USER ?? "e2e-persistent@t.dev";
  const login = await api.post("/api/auth/login", {
    data: { email: known, password: process.env.E2E_PASS ?? "correct horse battery" },
  });
  if (login.status() === 200) {
    cookie = (login.headers()["set-cookie"] ?? "").split(";")[0];
  } else {
    const reg = await api.post("/api/auth/register", {
      data: { email, name: "E2E", password: "correct horse battery" },
    });
    if (reg.status() === 201) {
      cookie = (reg.headers()["set-cookie"] ?? "").split(";")[0];
    } else {
      throw new Error(
        `seed: persistent login ${login.status()} and register ${reg.status()} both failed`,
      );
    }
  }
  const authed = await request.newContext({ baseURL: BASE(), extraHTTPHeaders: { cookie } });
  return withFreshProject(cookie, authed);
}

/** Creates the throwaway project every seeded session works on. */
async function withFreshProject(cookie: string, authed: APIRequestContext): Promise<Ctx> {
  const proj = await authed.post("/api/projects", {
    data: { name: `e2e ${n++}`, template: "article" },
  });
  expect(proj.status()).toBe(201);
  const { project } = await proj.json();
  const detail = await authed.get(`/api/projects/${project.id}`);
  const { files } = await detail.json();
  const main = files.find((f: { path: string }) => f.path === "main.tex");
  return { cookie, api: authed, projectId: project.id, mainId: main.id };
}

/**
 * A session for a SECOND persistent account (E2E_USER2, default
 * e2e-coviewer@t.dev): logged in when it exists, registered on first use.
 * For specs that need two DISTINCT users without spending registration quota
 * on every run. Throws when the account can neither log in nor be created.
 */
export async function seedAs(
  email = process.env.E2E_USER2 ?? "e2e-coviewer@t.dev",
  password = process.env.E2E_PASS ?? "correct horse battery",
): Promise<Ctx> {
  const api = await request.newContext({ baseURL: BASE() });
  const login = await api.post("/api/auth/login", { data: { email, password } });
  let cookie: string | undefined;
  if (login.status() === 200) {
    cookie = (login.headers()["set-cookie"] ?? "").split(";")[0];
  } else {
    const reg = await api.post("/api/auth/register", {
      data: { email, name: "Coauthor", password },
    });
    if (reg.status() === 201) {
      cookie = (reg.headers()["set-cookie"] ?? "").split(";")[0];
    } else if (reg.status() === 409) {
      const retry = await api.post("/api/auth/login", { data: { email, password } });
      expect(retry.status(), "coviewer exists but login fails").toBe(200);
      cookie = (retry.headers()["set-cookie"] ?? "").split(";")[0];
    } else {
      throw new Error(`seedAs: login ${login.status()} and register ${reg.status()} both failed`);
    }
  }
  const authed = await request.newContext({ baseURL: BASE(), extraHTTPHeaders: { cookie } });
  return withFreshProject(cookie, authed);
}

/** Injects the httpOnly session cookie so the page opens the workspace directly. */
export async function login(page: Page, ctx: Ctx) {
  const [name, ...rest] = ctx.cookie.split("=");
  await page.context().clearCookies();
  await page.context().addCookies([{ name, value: rest.join("="), url: BASE() }]);
}

/** Writes a project file through the API (asserts the 200). */
export async function putFile(ctx: Ctx, fileId: string, content: string, baseVersion: number) {
  const r = await ctx.api.put(`/api/projects/${ctx.projectId}/files/${fileId}`, {
    data: { content, baseVersion },
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as { version: number };
}

/** File content through the public seam the app itself uses (project detail). */
export async function getFile(ctx: Ctx, fileId: string) {
  const r = await ctx.api.get(`/api/projects/${ctx.projectId}`);
  expect(r.status()).toBe(200);
  const { files } = await r.json();
  const f = files.find((x: { id: string }) => x.id === fileId);
  expect(f, `file ${fileId} in project`).toBeTruthy();
  return f as { content: string; version: number };
}
