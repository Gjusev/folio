import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as submissionCheck } from "@/app/api/projects/[id]/submission-check/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { POST as createProject } from "@/app/api/projects/route";
import { PUT as putFile } from "@/app/api/projects/[id]/files/[fileId]/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../test/helpers";

// Fake compiler: /compile and /count with configurable replies, so the pages
// check can be driven through the real compileProject code path. Fixed port
// because env() caches COMPILER_URL once per test file.
const PORT = 39_127;
vi.hoisted(() => {
  process.env.COMPILER_URL = `http://127.0.0.1:39127`;
});

let compileReply: unknown = { ok: true, log: "Output written on main.pdf (3 pages, 100 bytes)." };
let countReply: unknown = { words: 42 };
const servers: Server[] = [];

beforeAll(async () => {
  const s = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    void (JSON.parse(raw || "{}") as unknown); // request body is not under test here
    const body = req.url === "/compile" ? compileReply : countReply;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(PORT, "127.0.0.1", () => r()));
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
  compileReply = { ok: true, log: "Output written on main.pdf (3 pages, 100 bytes)." };
  countReply = { words: 42 };
});

type FileDto = { id: string; path: string; content: string; version: number };

/** Article-template project (author "Your Name", plain bib style, no Limitations). */
async function setup() {
  const { cookie } = await signUp();
  const created = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "Venue paper" } }),
    undefined,
  );
  const { project } = await created.json();
  const detail = await (
    await getProject(
      request("GET", `/api/projects/${project.id}`, { cookie }),
      ctx({ id: project.id }),
    )
  ).json();
  const main = (detail.files as FileDto[]).find((f) => f.path === "main.tex")!;
  return { cookie, id: project.id as string, main };
}

const BASE_IDS = ["citations", "unused", "todos", "figures", "abstract", "keywords"];

const get = (cookie: string, id: string, venue?: string) =>
  submissionCheck(
    request("GET", `/api/projects/${id}/submission-check${venue ? `?venue=${venue}` : ""}`, {
      cookie,
    }),
    ctx({ id }),
  );

describe("GET /api/projects/[id]/submission-check", () => {
  it("without venue keeps exactly today's checks (regression)", async () => {
    const { cookie, id } = await setup();
    const { checks, words } = await (await get(cookie, id)).json();
    expect(checks.map((c: { id: string }) => c.id)).toEqual(BASE_IDS);
    expect(words).toBe(42);
  });

  it("an unknown venue behaves like no venue", async () => {
    const { cookie, id } = await setup();
    const { checks } = await (await get(cookie, id, "does-not-exist")).json();
    expect(checks.map((c: { id: string }) => c.id)).toEqual(BASE_IDS);
  });

  it("venue=acl flags the missing Limitations section and passes once added", async () => {
    const { cookie, id, main } = await setup();
    const first = await (await get(cookie, id, "acl")).json();
    expect(first.checks.map((c: { id: string }) => c.id)).toEqual([
      ...BASE_IDS,
      "pages",
      "blind",
      "sections",
      "bibstyle",
    ]);
    const byId = Object.fromEntries(first.checks.map((c: { id: string }) => [c.id, c])) as Record<
      string,
      { ok: boolean; detail: { code: string; vars?: Record<string, unknown> } }
    >;
    // 3-page compile under ACL's 8-page limit
    expect(byId.pages).toMatchObject({ ok: true, detail: { code: "check.pages.ok" } });
    expect(byId.pages.detail.vars).toMatchObject({ pages: 3, limit: 8, scope: "excl-refs" });
    // The template carries a named author: a possible de-anonymisation signal.
    expect(byId.blind).toMatchObject({ ok: false, detail: { code: "check.blind.bad" } });
    expect(byId.blind.detail.vars?.list).toContain("main.tex (author-block)");
    // plain is not the ACL style.
    expect(byId.bibstyle).toMatchObject({
      ok: false,
      detail: { code: "check.bibstyle.bad", vars: { expected: "acl.sty", found: "plain" } },
    });
    // The required section is missing…
    expect(byId.sections).toMatchObject({
      ok: false,
      detail: { code: "check.sections.bad", vars: { list: "Limitations" } },
    });

    // …and adding \section*{Limitations} turns the check green.
    const updated = await putFile(
      request("PUT", `/api/projects/${id}/files/${main.id}`, {
        cookie,
        body: {
          content: `${main.content}\n\\section*{Limitations}\nNone.\n`,
          baseVersion: main.version,
        },
      }),
      ctx({ id, fileId: main.id }),
    );
    expect(updated.status).toBe(200);
    const second = await (await get(cookie, id, "acl")).json();
    const sections = second.checks.find((c: { id: string }) => c.id === "sections");
    expect(sections).toMatchObject({ ok: true, detail: { code: "check.sections.ok" } });
  });

  it("venue=arxiv adds only the pages check (no limit, no style, no blind)", async () => {
    const { cookie, id } = await setup();
    const { checks } = await (await get(cookie, id, "arxiv")).json();
    expect(checks.map((c: { id: string }) => c.id)).toEqual([...BASE_IDS, "pages"]);
    expect(checks[BASE_IDS.length]).toMatchObject({
      ok: true,
      detail: { code: "check.pages.nolimit" },
    });
  });

  it("pages over the limit fail and a silent compiler stays neutral", async () => {
    const { cookie, id } = await setup();
    // 10 compiled pages against NeurIPS' 9-page body limit.
    compileReply = { ok: true, log: "Output written on main.pdf (10 pages, 100 bytes)." };
    const over = await (await get(cookie, id, "neurips")).json();
    const pages = over.checks.find((c: { id: string }) => c.id === "pages");
    expect(pages).toMatchObject({
      ok: false,
      detail: { code: "check.pages.bad", vars: { pages: 10, limit: 9 } },
    });

    // Compiler down: the check degrades to neutral, the route stays 200.
    compileReply = null; // a JSON "null" reply breaks the log read → unknown
    countReply = null; // the word count degrades the same way
    const down = await get(cookie, id, "neurips");
    expect(down.status).toBe(200);
    const body = await down.json();
    const unknown = body.checks.find((c: { id: string }) => c.id === "pages");
    expect(unknown).toMatchObject({ ok: true, detail: { code: "check.pages.unknown" } });
    expect(body.words).toBeNull(); // the word count degrades the same way
  });
});
