import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as reviewRoute } from "@/app/api/projects/[id]/review/route";
import { POST as createDemo } from "@/app/api/projects/demo/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

const LLM_PORT = 39_133;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:39133/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_API_KEY = "";
});

const servers: Server[] = [];
let lastPrompt = "";
let reply = "";

/** A fake OpenAI-compatible model that answers with whatever `reply` holds. */
beforeAll(async () => {
  const s = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      lastPrompt = JSON.stringify(JSON.parse(data).messages);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const half = Math.floor(reply.length / 2);
      for (const piece of [reply.slice(0, half), reply.slice(half)]) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      }
      res.end("data: [DONE]\n\n");
    });
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(LLM_PORT, "127.0.0.1", () => r()));
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await closeDb();
});

beforeEach(() => resetRateLimits());

async function demo() {
  const { cookie } = await signUp();
  const created = await createDemo(
    request("POST", "/api/projects/demo", { cookie, body: { lang: "en" } }),
    undefined,
  );
  const { project } = await created.json();
  const detail = await (
    await getProject(
      request("GET", `/api/projects/${project.id}`, { cookie }),
      ctx({ id: project.id }),
    )
  ).json();
  const main = (detail.files as { path: string; content: string }[]).find(
    (f) => f.path === "main.tex",
  )!;
  const lineOf = (needle: string) =>
    main.content.split("\n").findIndex((l) => l.includes(needle)) + 1;
  return { cookie, id: project.id as string, lineOf };
}

const post = (cookie: string, id: string, body: unknown) =>
  reviewRoute(request("POST", `/api/projects/${id}/review`, { cookie, body }), ctx({ id }));

describe("POST /api/projects/[id]/review", () => {
  it("returns verified comments and never lets the model place one on an unseen line", async () => {
    const { cookie, id, lineOf } = await demo();
    const intro = lineOf("The Transformer~");
    reply = JSON.stringify({
      summary: "Clear, but the claims need numbers.",
      scores: { clarity: 4, evidence: 2 },
      comments: [
        {
          aspect: "evidence",
          severity: "major",
          file: "main.tex",
          line: intro,
          quote: "replaced recurrence with attention",
          comment: "No evidence is given for this claim.",
          suggestion: "Cite a benchmark result.",
        },
        {
          aspect: "clarity",
          severity: "nit",
          file: "main.tex",
          line: 9999,
          quote: "made up",
          comment: "Located on a line that does not exist.",
        },
      ],
    });
    const res = await post(cookie, id, {
      lang: "en",
      aspects: ["evidence", "clarity"],
      rigor: "strict",
      focus: "claims in the introduction",
      scope: "all",
    });
    expect(res.status).toBe(200);
    const { review, meta } = await res.json();
    expect(meta.sections).toBeGreaterThan(2);
    expect(review.comments[0]).toMatchObject({ severity: "major", file: "main.tex", line: intro });
    expect(review.comments[0].quote).toBe("replaced recurrence with attention");
    expect(review.comments[1]).toMatchObject({ file: null, line: null, quote: null });
    expect(lastPrompt).toMatch(/Reviewer 2/);
    expect(lastPrompt).toMatch(/claims in the introduction/);
  });

  it("sends only the sections the author ticked", async () => {
    const { cookie, id } = await demo();
    reply = JSON.stringify({ summary: "ok", comments: [] });
    const all = await (
      await post(cookie, id, { lang: "en", aspects: ["clarity"], scope: "all" })
    ).json();
    expect(all.meta.sections).toBeGreaterThan(1);
    expect(lastPrompt).toMatch(/Discussion/);

    const detail = await (
      await getProject(request("GET", `/api/projects/${id}`, { cookie }), ctx({ id }))
    ).json();
    expect(detail.files.length).toBeGreaterThan(0);
    // Section ids are `main.tex#n`; #0 is the abstract/title block.
    await post(cookie, id, { lang: "en", aspects: ["clarity"], scope: ["main.tex#0"] });
    expect(lastPrompt).toMatch(/\\\\begin\{abstract\}/);
    expect(lastPrompt).not.toMatch(/Discussion/);
  });

  it("rejects an empty selection, bad aspects and non-owners; 502 on junk from the model", async () => {
    const { cookie, id } = await demo();
    reply = "I cannot do that";
    const empty = await post(cookie, id, { lang: "en", aspects: ["clarity"], scope: ["nope#9"] });
    expect(empty.status).toBe(400);
    const bad = await post(cookie, id, { lang: "en", aspects: ["vibes"], scope: "all" });
    expect(bad.status).toBe(400);
    const junk = await post(cookie, id, { lang: "en", aspects: ["clarity"], scope: "all" });
    expect(junk.status).toBe(502);
    const stranger = await signUp();
    const nope = await post(stranger.cookie, id, {
      lang: "en",
      aspects: ["clarity"],
      scope: "all",
    });
    expect(nope.status).toBe(404);
  });

  it("is rate limited", async () => {
    const { cookie, id } = await demo();
    reply = JSON.stringify({ summary: "ok", comments: [] });
    let last = 200;
    for (let i = 0; i < 8; i++)
      last = (await post(cookie, id, { lang: "en", aspects: ["clarity"], scope: "all" })).status;
    expect(last).toBe(429);
  });
});
