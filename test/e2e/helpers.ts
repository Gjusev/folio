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
  const reg = await api.post("/api/auth/register", {
    data: { email, name: "E2E", password: "correct horse battery" },
  });
  if (reg.status() === 201) {
    cookie = (reg.headers()["set-cookie"] ?? "").split(";")[0];
  } else {
    const known = process.env.E2E_USER ?? "e2e-persistent@t.dev";
    const login = await api.post("/api/auth/login", {
      data: { email: known, password: process.env.E2E_PASS ?? "correct horse battery" },
    });
    expect(login.status(), `register=${reg.status()} login=${login.status()}`).toBe(200);
    cookie = (login.headers()["set-cookie"] ?? "").split(";")[0];
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
