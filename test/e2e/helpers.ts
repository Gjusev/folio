import { request, expect, type APIRequestContext, type Page } from "@playwright/test";

export type Ctx = { cookie: string; api: APIRequestContext; projectId: string; mainId: string };

const BASE = () => process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
let n = 0;

// One login for the whole run (workers:1): the suite registers/logs in far
// more often than the (right) per-IP limits allow if every spec opens its own
// account. Specs needing a DISTINCT account pass { fresh: true }.
let sharedCookie: string | null = null;

/** A project with the article template on a session. Default: the persistent
 *  local account (one login per run, memoized). { fresh: true } registers a
 *  unique account — for tests whose premise is two different users. */
export async function seed(opts?: { fresh?: boolean }): Promise<Ctx> {
  const api = await request.newContext({ baseURL: BASE() });
  let cookie: string;
  if (opts?.fresh) {
    const email = `e2e-${Date.now()}-${n++}@t.dev`;
    const reg = await api.post("/api/auth/register", {
      data: { email, name: "E2E", password: "correct horse battery" },
    });
    expect(reg.status(), `register=${reg.status()}`).toBe(201);
    cookie = (reg.headers()["set-cookie"] ?? "").split(";")[0];
  } else if (sharedCookie) {
    cookie = sharedCookie;
  } else {
    const known = process.env.E2E_USER ?? "e2e-persistent@t.dev";
    const login = await api.post("/api/auth/login", {
      data: { email: known, password: process.env.E2E_PASS ?? "correct horse battery" },
    });
    expect(login.status(), `persistent login=${login.status()}`).toBe(200);
    sharedCookie = cookie = (login.headers()["set-cookie"] ?? "").split(";")[0];
  }
  const authed = await request.newContext({ baseURL: BASE(), extraHTTPHeaders: { cookie } });
  const proj = await authed.post("/api/projects", {
    data: { name: `e2e ${n}`, template: "article" },
  });
  expect(proj.status()).toBe(201);
  const { project } = await proj.json();
  const detail = await authed.get(`/api/projects/${project.id}`);
  const { files } = await detail.json();
  const main = files.find((f: { path: string }) => f.path === "main.tex");
  return { cookie, api: authed, projectId: project.id, mainId: main.id };
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
