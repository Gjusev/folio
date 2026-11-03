import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as agentRoute } from "@/app/api/projects/[id]/agent/route";
import { POST as createProject } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

const LLM_PORT = 39_131;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:39131/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_API_KEY = "";
});

const servers: Server[] = [];

function listen(port: number, handler: Parameters<typeof createServer>[1]) {
  const s = createServer(handler);
  servers.push(s);
  return new Promise<void>((r) => s.listen(port, "127.0.0.1", () => r()));
}

/** The fake model cites one real bib key, one evidence key and one invented key. */
const FAKE_DRAFT =
  "Efficient attention \\cite{vaswani2017attention} and long documents \\cite{beltagy2020longformer} and lies \\cite{madeup2024lie}.";

beforeAll(async () => {
  await listen(LLM_PORT, async (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const piece of [FAKE_DRAFT.slice(0, 20), FAKE_DRAFT.slice(20)]) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  });
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

async function setup() {
  const { cookie } = await signUp();
  const res = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "Agent paper" } }),
    undefined,
  );
  const { project } = await res.json();
  const detail = await (
    await getProject(
      request("GET", `/api/projects/${project.id}`, { cookie }),
      ctx({ id: project.id }),
    )
  ).json();
  const files = detail.files as { id: string; path: string }[];
  return { cookie, id: project.id as string, main: files.find((f) => f.path === "main.tex")! };
}

function mockOpenAlex() {
  const realFetch = globalThis.fetch;
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://api.openalex.org/works?")) {
        return Response.json({
          results: [
            {
              id: "https://openalex.org/W4321119",
              doi: "https://doi.org/10.48550/arXiv.2004.05150",
              display_name: "Longformer: The Long-Document Transformer",
              publication_year: 2020,
              authorships: [
                { author: { display_name: "Iz Beltagy" } },
                { author: { display_name: "Matthew Peters" } },
              ],
              cited_by_count: 2000,
              referenced_works: [],
            },
          ],
          meta: { has_more: false },
        });
      }
      return realFetch(input as Parameters<typeof fetch>[0], init);
    });
}

describe("drafting agent", () => {
  it("searches, streams, strips invented keys and reports new papers", async () => {
    const { cookie, id, main } = await setup();
    const spy = mockOpenAlex();
    try {
      const res = await agentRoute(
        request("POST", `/api/projects/${id}/agent`, {
          cookie,
          body: {
            instruction: "a related work section about efficient attention",
            fileId: main.id,
          },
        }),
        ctx({ id }),
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      const events = text
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as Record<string, unknown>);

      const evidence = events.find((e) => e.type === "evidence") as unknown as {
        items: { key: string; inBib: boolean; source: string }[];
        bibKeys: string[];
      };
      expect(evidence.bibKeys).toContain("vaswani2017attention");
      expect(evidence.items).toHaveLength(1);
      expect(evidence.items[0]).toMatchObject({ key: "beltagy2020longformer", inBib: false });

      // Tokens stream and reassemble into the draft.
      const tokens = events
        .filter((e) => e.type === "token")
        .map((e) => e.text)
        .join("");
      expect(tokens).toContain("Efficient attention");

      const done = events.find((e) => e.type === "done") as unknown as {
        latex: string;
        usedKeys: string[];
        newPapers: { source: string; paperId: string; key: string }[];
      };
      expect(done.latex).toContain("\\cite{vaswani2017attention}");
      expect(done.latex).toContain("\\cite{beltagy2020longformer}");
      expect(done.latex).not.toContain("madeup2024lie"); // invented key stripped
      expect(done.usedKeys.sort()).toEqual(["beltagy2020longformer", "vaswani2017attention"]);
      expect(done.newPapers).toEqual([
        { source: "openalex", paperId: "W4321119", key: "beltagy2020longformer" },
      ]);
      expect(events.some((e) => e.type === "error")).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("does not touch other users' projects", async () => {
    const a = await setup();
    const other = await signUp();
    const res = await agentRoute(
      request("POST", `/api/projects/${a.id}/agent`, {
        cookie: other.cookie,
        body: { instruction: "x".repeat(10), fileId: a.main.id },
      }),
      ctx({ id: a.id }),
    );
    expect(res.status).toBe(404);
  });

  it("validates the instruction", async () => {
    const { cookie, id, main } = await setup();
    const res = await agentRoute(
      request("POST", `/api/projects/${id}/agent`, {
        cookie,
        body: { instruction: "short", fileId: main.id },
      }),
      ctx({ id }),
    );
    expect(res.status).toBe(400);
  });
});
