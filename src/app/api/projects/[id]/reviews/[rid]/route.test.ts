import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as reviewRoute } from "@/app/api/projects/[id]/review/route";
import {
  DELETE as deleteReview,
  GET as getReviewRoute,
} from "@/app/api/projects/[id]/reviews/[rid]/route";
import { PATCH as patchStates } from "@/app/api/projects/[id]/reviews/[rid]/states/route";
import { POST as addMember } from "@/app/api/projects/[id]/members/route";
import { POST as createDemo } from "@/app/api/projects/demo/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../../test/helpers";

const LLM_PORT = 39_136;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:39136/v1";
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

/** Seeds one saved review with two verified comments; returns its id. */
async function seed(cookie: string, id: string, lineOf: (needle: string) => number) {
  const intro = lineOf("The Transformer~");
  reply = JSON.stringify({
    summary: "Two findings.",
    scores: { clarity: 3 },
    comments: [
      {
        aspect: "clarity",
        severity: "minor",
        file: "main.tex",
        line: intro,
        quote: "replaced recurrence with attention",
        comment: "This is dense.",
        suggestion: "Split the sentence.",
      },
      {
        aspect: "clarity",
        severity: "nit",
        file: "main.tex",
        line: intro,
        quote: "replaced recurrence with attention",
        comment: "Nit on the same line.",
        suggestion: "",
      },
    ],
  });
  const res = await reviewRoute(
    request("POST", `/api/projects/${id}/review`, {
      cookie,
      body: { lang: "en", aspects: ["clarity"], scope: "all" },
    }),
    ctx({ id }),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { savedId: string }).savedId;
}

const get = (cookie: string, id: string, rid: string) =>
  getReviewRoute(
    request("GET", `/api/projects/${id}/reviews/${rid}`, { cookie }),
    ctx({ id, rid }),
  );
const patch = (cookie: string, id: string, rid: string, states: unknown) =>
  patchStates(
    request("PATCH", `/api/projects/${id}/reviews/${rid}/states`, { cookie, body: { states } }),
    ctx({ id, rid }),
  );
const del = (cookie: string, id: string, rid: string) =>
  deleteReview(
    request("DELETE", `/api/projects/${id}/reviews/${rid}`, { cookie }),
    ctx({ id, rid }),
  );

describe("GET/PATCH/DELETE /api/projects/[id]/reviews/[rid]", () => {
  it("loads a saved review with result and states; PATCH replaces states and persists", async () => {
    const { cookie, id, lineOf } = await demo();
    const rid = await seed(cookie, id, lineOf);

    const loaded = await get(cookie, id, rid);
    expect(loaded.status).toBe(200);
    const { review } = await loaded.json();
    expect(review.result.summary).toBe("Two findings.");
    expect(review.result.comments).toHaveLength(2);
    expect(review.result.comments[0]).toMatchObject({ aspect: "clarity", file: "main.tex" });
    expect(review.states).toEqual({});

    expect((await patch(cookie, id, rid, { "0": "dismissed", "1": "resolved" })).status).toBe(200);
    // Replaces wholesale: the old "0" entry disappears.
    expect((await patch(cookie, id, rid, { "1": "dismissed" })).status).toBe(200);
    const after = await (await get(cookie, id, rid)).json();
    expect(after.review.states).toEqual({ "1": "dismissed" });
  });

  it("states: 400 on an out-of-range index, 403 for another member, 404 for a stranger", async () => {
    const { cookie, id, lineOf } = await demo();
    const rid = await seed(cookie, id, lineOf);
    expect((await patch(cookie, id, rid, { "5": "resolved" })).status).toBe(400);
    expect((await patch(cookie, id, rid, { nope: "resolved" })).status).toBe(400);
    expect((await patch(cookie, id, rid, { "0": "forgotten" })).status).toBe(400);

    // Another project member can see the review but only the author may change it.
    const viewer = await signUp();
    const invite = await addMember(
      request("POST", `/api/projects/${id}/members`, {
        cookie,
        body: { email: viewer.email, role: "viewer" },
      }),
      ctx({ id }),
    );
    expect(invite.status).toBe(201);
    expect((await get(viewer.cookie, id, rid)).status).toBe(200);
    expect((await patch(viewer.cookie, id, rid, { "0": "resolved" })).status).toBe(403);

    const stranger = await signUp();
    expect((await patch(stranger.cookie, id, rid, { "0": "resolved" })).status).toBe(404);
    expect((await get(stranger.cookie, id, rid)).status).toBe(404);
  });

  it("DELETE is author-only: members get 403, the author removes it", async () => {
    const { cookie, id, lineOf } = await demo();
    const rid = await seed(cookie, id, lineOf);

    const editor = await signUp();
    await addMember(
      request("POST", `/api/projects/${id}/members`, {
        cookie,
        body: { email: editor.email, role: "editor" },
      }),
      ctx({ id }),
    );
    expect((await del(editor.cookie, id, rid)).status).toBe(403);
    expect((await del(cookie, id, rid)).status).toBe(200);
    expect((await get(cookie, id, rid)).status).toBe(404);
  });
});
