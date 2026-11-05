import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as reviewRoute } from "@/app/api/projects/[id]/review/route";
import { GET as listReviewsRoute } from "@/app/api/projects/[id]/reviews/route";
import { POST as createDemo } from "@/app/api/projects/demo/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { listReviews } from "@/lib/reviews-store";
import { ctx, request, signUp } from "../../../../../../test/helpers";

const LLM_PORT = 39_135;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:39135/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_API_KEY = "";
});

const servers: Server[] = [];
let reply = "";

/** A fake OpenAI-compatible model that answers with whatever `reply` holds. */
beforeAll(async () => {
  const s = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
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

const postReview = (cookie: string, id: string, body: unknown) =>
  reviewRoute(request("POST", `/api/projects/${id}/review`, { cookie, body }), ctx({ id }));
const list = (cookie: string, id: string) =>
  listReviewsRoute(request("GET", `/api/projects/${id}/reviews`, { cookie }), ctx({ id }));

describe("POST /api/projects/[id]/review + GET /api/projects/[id]/reviews", () => {
  it("saves each run and lists the history newest first, without result bodies", async () => {
    const { cookie, id, lineOf } = await demo();
    const intro = lineOf("The Transformer~");
    const savedIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      reply = JSON.stringify({
        summary: `Run ${i}`,
        scores: { clarity: 3 },
        comments: [
          {
            aspect: "clarity",
            severity: "minor",
            file: "main.tex",
            line: intro,
            quote: "replaced recurrence with attention",
            comment: `Comment of run ${i}.`,
            suggestion: "",
          },
        ],
      });
      const res = await postReview(cookie, id, { lang: "en", aspects: ["clarity"], scope: "all" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.savedId).toBe("string");
      savedIds.push(body.savedId);
    }
    expect(new Set(savedIds).size).toBe(3);

    const res = await list(cookie, id);
    expect(res.status).toBe(200);
    const { reviews } = await res.json();
    expect(reviews).toHaveLength(3);
    expect(reviews.map((r: { id: string }) => r.id)).toEqual([...savedIds].reverse());
    for (const r of reviews) {
      expect(r).toMatchObject({
        userId: expect.any(String),
        userName: "Test User",
        lang: "en",
        aspects: ["clarity"],
        rigor: "reviewer",
        focus: "",
      });
      expect(typeof r.createdAt).toBe("string");
      expect("result" in r).toBe(false);
      expect("states" in r).toBe(false);
    }

    // The route caps the list at 30 (REVIEW_HISTORY_LIMIT); three posts cannot
    // reach it, so the cap itself is checked at the store the route calls.
    const owner = reviews[0].userId as string;
    const capped = await listReviews(owner, id, 2);
    expect(capped.map((r) => r.id)).toEqual([savedIds[2], savedIds[1]]);
  });

  it("strangers get a uniform 404 on the history", async () => {
    const { cookie, id } = await demo();
    reply = JSON.stringify({ summary: "ok", comments: [] });
    await postReview(cookie, id, { lang: "en", aspects: ["clarity"], scope: "all" });
    const stranger = await signUp();
    expect((await list(stranger.cookie, id)).status).toBe(404);
  });
});
