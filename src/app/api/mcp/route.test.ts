import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as mcpDelete, GET as mcpGet, POST as mcpPost } from "@/app/api/mcp/route";
import { POST as addMember } from "@/app/api/projects/[id]/members/route";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { createApiToken, type TokenScope } from "@/lib/api-tokens";
import { closeDb, db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { deleteFile } from "@/lib/projects";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../test/helpers";

const mocks = vi.hoisted(() => ({
  compileProject: vi.fn(),
  searchPapers: vi.fn(),
  getPaper: vi.fn(),
}));
vi.mock("@/lib/compiler", async (orig) => ({
  ...(await orig<typeof import("@/lib/compiler")>()),
  compileProject: mocks.compileProject,
}));
vi.mock("@/lib/papers", async (orig) => ({
  ...(await orig<typeof import("@/lib/papers")>()),
  searchPapers: mocks.searchPapers,
  getPaper: mocks.getPaper,
}));

const PAPER = {
  source: "openalex" as const,
  id: "W2741809801",
  doi: "10.48550/arXiv.2005.14165",
  title: "Language Models are Few-Shot Learners",
  authors: ["Alec Radford"],
  year: 2020,
  venue: "arXiv",
  type: "preprint",
  citedBy: 1234,
};

beforeEach(() => {
  resetRateLimits();
  vi.resetAllMocks();
});

afterAll(closeDb);

async function userIdOf(email: string) {
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return row.id;
}

async function tokenFor(email: string, scopes: TokenScope[]) {
  return (await createApiToken(await userIdOf(email), "mcp test", scopes)).token;
}

/** A fresh user with a fresh project (default template: main.tex + references.bib). */
async function seedProject() {
  const { cookie, email } = await signUp();
  const res = await createProjectRoute(
    request("POST", "/api/projects", { cookie, body: { name: "MCP paper" } }),
    undefined,
  );
  if (res.status !== 201) throw new Error(`seed failed: ${res.status}`);
  const { project } = await res.json();
  return { cookie, email, id: project.id as string };
}

function mcpRequest(token: string | null, body: unknown, cookie?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  return mcpPost(request("POST", "/api/mcp", { headers, body }), undefined);
}

async function rpc(token: string, method: string, params?: unknown) {
  const res = await mcpRequest(token, { jsonrpc: "2.0", id: 1, method, params });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** tools/call, with the text content parsed when it is JSON. */
async function call(token: string, name: string, args: unknown) {
  const res = await mcpRequest(token, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  expect(res.status).toBe(200);
  const { result } = (await res.json()) as {
    result: { content: { text: string }[]; isError?: boolean };
  };
  const text = result.content[0].text;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  return { isError: result.isError === true, text, value };
}

describe("MCP transport", () => {
  it("rejects anonymous calls with 401 and WWW-Authenticate", async () => {
    const res = await mcpRequest(null, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("accepts a session cookie as the same user (initialize + tools/list)", async () => {
    const { cookie, email } = await seedProject();
    const viaSession = new NextRequest(new URL("/api/mcp", "http://localhost:3000"), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "initialize", params: {} }),
    });
    const res = await mcpPost(viaSession, undefined);
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name,
    ).toBe("folio");
    expect(email).toBeTruthy();
  });

  it("initializes, echoes date-like protocol versions, falls back otherwise", async () => {
    const { email } = await seedProject();
    const token = await tokenFor(email, ["read"]);
    const init = await rpc(token, "initialize", { protocolVersion: "2025-11-05" });
    expect(init.body.result).toMatchObject({
      protocolVersion: "2025-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "folio", version: "0.1.0" },
    });
    const fallback = await rpc(token, "initialize", { protocolVersion: 1 });
    expect((fallback.body.result as { protocolVersion: string }).protocolVersion).toBe(
      "2025-06-18",
    );

    const list = await rpc(token, "tools/list");
    const tools = (
      list.body.result as {
        tools: { name: string; inputSchema: { type: string } }[];
      }
    ).tools;
    expect(tools).toHaveLength(9);
    expect(tools.map((t) => t.name)).toContain("write_file");
    expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true);
  });

  it("answers notifications with 202/empty and unknown methods with -32601", async () => {
    const { email } = await seedProject();
    const token = await tokenFor(email, ["read"]);
    const note = await mcpRequest(token, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.status).toBe(202);
    expect(await note.text()).toBe("");
    const unknown = await rpc(token, "no/such/method");
    expect((unknown.body.error as { code: number }).code).toBe(-32601);
  });

  it("returns -32700 for an unparsable body and -32602 for unknown tool / bad arguments", async () => {
    const { email } = await seedProject();
    const token = await tokenFor(email, ["read"]);
    const bad = new NextRequest(new URL("/api/mcp", "http://localhost:3000"), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{not json",
    });
    const parseErr = await mcpPost(bad, undefined);
    expect(parseErr.status).toBe(200);
    expect(((await parseErr.json()) as { error: { code: number } }).error.code).toBe(-32700);

    const unknownTool = await rpc(token, "tools/call", { name: "nope", arguments: {} });
    expect((unknownTool.body.error as { code: number }).code).toBe(-32602);

    const badArgs = await rpc(token, "tools/call", { name: "read_file", arguments: { path: "x" } });
    expect((badArgs.body.error as { code: number }).code).toBe(-32602);
  });

  it("only allows POST (GET and DELETE get 405 with Allow)", async () => {
    for (const handler of [mcpGet, mcpDelete]) {
      const res = await handler(request("GET", "/api/mcp"), undefined);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });
});

describe("MCP tools over a personal token", () => {
  it("write_file → read_file roundtrip with optimistic concurrency", async () => {
    const { email, id } = await seedProject();
    const token = await tokenFor(email, ["read", "write"]);

    const projects = await call(token, "list_projects", {});
    expect(projects.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, name: "MCP paper", role: "owner", mainFile: "main.tex" }),
      ]),
    );
    const detail = await call(token, "get_project", { projectId: id });
    expect(detail.value).toMatchObject({ name: "MCP paper", mainFile: "main.tex", role: "owner" });
    const paths = (detail.value as { files: { path: string }[] }).files.map((f) => f.path);
    expect(paths).toContain("main.tex");
    expect(paths).toContain("references.bib");

    const created = await call(token, "write_file", {
      projectId: id,
      path: "sections/agent.tex",
      content: "\\section{From the agent}",
    });
    expect(created.isError).toBe(false);
    expect(created.value).toEqual({ path: "sections/agent.tex", version: 1, created: true });

    const read = await call(token, "read_file", { projectId: id, path: "sections/agent.tex" });
    expect(read.value).toMatchObject({
      path: "sections/agent.tex",
      content: "\\section{From the agent}",
      version: 1,
    });

    const updated = await call(token, "write_file", {
      projectId: id,
      path: "sections/agent.tex",
      content: "\\section{Rewritten}",
      baseVersion: 1,
    });
    expect(updated.value).toEqual({ path: "sections/agent.tex", version: 2 });

    const stale = await call(token, "write_file", {
      projectId: id,
      path: "sections/agent.tex",
      content: "lost update",
      baseVersion: 1,
    });
    expect(stale.isError).toBe(true);
    expect(stale.text).toMatch(/version is 2/);

    const blind = await call(token, "write_file", {
      projectId: id,
      path: "main.tex",
      content: "overwritten blind",
    });
    expect(blind.isError).toBe(true);
    expect(blind.text).toMatch(/read_file/);

    const missing = await call(token, "read_file", { projectId: id, path: "ghost.tex" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/ghost\.tex/);
  });

  it("refuses writes when the token lacks the write scope", async () => {
    const { email, id } = await seedProject();
    const token = await tokenFor(email, ["read"]);
    const denied = await call(token, "write_file", {
      projectId: id,
      path: "evil.tex",
      content: "x",
    });
    expect(denied.isError).toBe(true);
    expect(denied.text).toContain("«write»");
    // reads still work with the same token
    const ok = await call(token, "get_project", { projectId: id });
    expect(ok.isError).toBe(false);
  });

  it("enforces the project role: a viewer's token reads but cannot write", async () => {
    const owner = await seedProject();
    const viewer = await signUp();
    await addMember(
      request("POST", `/api/projects/${owner.id}/members`, {
        cookie: owner.cookie,
        body: { email: viewer.email, role: "viewer" },
      }),
      ctx({ id: owner.id }),
    );
    const token = await tokenFor(viewer.email, ["read", "write"]);

    const seen = await call(token, "get_project", { projectId: owner.id });
    expect(seen.value).toMatchObject({ role: "viewer" });

    const write = await call(token, "write_file", {
      projectId: owner.id,
      path: "evil.tex",
      content: "x",
    });
    expect(write.isError).toBe(true);
    expect(write.text).toMatch(/solo lectura/);
  });

  it("compile returns parsed errors and never the PDF bytes", async () => {
    const { email, id } = await seedProject();
    const token = await tokenFor(email, ["read", "compile"]);

    mocks.compileProject.mockResolvedValueOnce({ ok: true, log: "clean", pdf: "SECRETPDFBYTES" });
    const ok = await call(token, "compile", { projectId: id });
    expect(ok.value).toMatchObject({ ok: true, errors: [], warningCount: 0 });
    expect(ok.text).not.toContain("SECRETPDFBYTES");
    expect(mocks.compileProject).toHaveBeenCalledWith(
      "main.tex",
      expect.arrayContaining([expect.objectContaining({ path: "main.tex" })]),
    );

    mocks.compileProject.mockResolvedValueOnce({
      ok: false,
      log: "./main.tex:12: Undefined control sequence.\nLaTeX Warning: Empty `figure' environment",
    });
    const fail = await call(token, "compile", { projectId: id });
    expect(fail.value).toMatchObject({
      ok: false,
      warningCount: 1,
      errors: [{ file: "main.tex", line: 12, message: "Undefined control sequence." }],
    });

    mocks.compileProject.mockRejectedValueOnce(
      new HttpError(504, "La compilación tardó demasiado"),
    );
    const unreachable = await call(token, "compile", { projectId: id });
    expect(unreachable.isError).toBe(true);
    expect(unreachable.text).toMatch(/compilaci/);

    // No compile scope, no sandbox run.
    const bare = await tokenFor(email, ["read"]);
    const noScope = await call(bare, "compile", { projectId: id });
    expect(noScope.isError).toBe(true);
    expect(noScope.text).toContain("«compile»");
  });

  it("search_literature maps OpenAlex results and honours the limit", async () => {
    const { email } = await seedProject();
    const token = await tokenFor(email, ["read", "literature"]);
    mocks.searchPapers.mockResolvedValueOnce({
      results: Array.from({ length: 10 }, (_, i) => ({ ...PAPER, id: `W${i}` })),
      hasMore: true,
    });
    const out = await call(token, "search_literature", { query: "few-shot learners", limit: 3 });
    expect(mocks.searchPapers).toHaveBeenCalledWith("openalex", {
      q: "few-shot learners",
      sort: "relevance",
      openAccess: false,
      page: 1,
    });
    expect(out.value).toEqual([
      expect.objectContaining({ title: PAPER.title, paperId: "W0", citedBy: PAPER.citedBy }),
      expect.objectContaining({ paperId: "W1" }),
      expect.objectContaining({ paperId: "W2" }),
    ]);
    expect((out.value as unknown[]).every((r) => !("abstract" in (r as object)))).toBe(true);
  });

  it("add_reference demands a .bib, then appends and dedupes entries", async () => {
    const { email, id } = await seedProject();
    const token = await tokenFor(email, ["read", "write", "literature"]);
    mocks.getPaper.mockResolvedValue(PAPER);

    // Remove the template's references.bib to test the no-bib guidance.
    const detail = await call(token, "get_project", { projectId: id });
    const bibFile = (detail.value as { files: { id: string; path: string }[] }).files.find((f) =>
      f.path.endsWith(".bib"),
    );
    await deleteFile(id, "main.tex", bibFile!.id);

    const noBib = await call(token, "add_reference", {
      projectId: id,
      source: "openalex",
      paperId: PAPER.id,
    });
    expect(noBib.isError).toBe(true);
    expect(noBib.text).toMatch(/\.bib/);
    expect(noBib.text).toMatch(/write_file/);

    await call(token, "write_file", { projectId: id, path: "refs.bib", content: "" });
    const added = await call(token, "add_reference", {
      projectId: id,
      source: "openalex",
      paperId: PAPER.id,
    });
    expect(added.value).toEqual({ key: "radford2020language", added: true, bibPath: "refs.bib" });

    const read = await call(token, "read_file", { projectId: id, path: "refs.bib" });
    expect((read.value as { content: string }).content).toContain("radford2020language,");

    const dup = await call(token, "add_reference", {
      projectId: id,
      source: "openalex",
      paperId: PAPER.id,
    });
    expect(dup.value).toEqual({ key: "radford2020language", added: false, bibPath: "refs.bib" });
  });

  it("create_snapshot checkpoints and list_snapshots shows it", async () => {
    const { email, id } = await seedProject();
    const token = await tokenFor(email, ["read", "write"]);
    const snap = await call(token, "create_snapshot", { projectId: id, label: "before edits" });
    expect(snap.value).toMatchObject({ label: "before edits" });
    expect((snap.value as { id: string }).id).toBeTruthy();

    const list = await call(token, "list_snapshots", { projectId: id });
    expect(list.value).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "before edits" })]),
    );
  });
});
