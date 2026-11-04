import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listComments, POST as postComment } from "@/app/api/projects/[id]/comments/route";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { POST as addMember } from "@/app/api/projects/[id]/members/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../test/helpers";

type FileDto = { id: string; path: string; content: string; version: number };

async function newProject(cookie: string) {
  const created = await createProjectRoute(
    request("POST", "/api/projects", { cookie, body: { name: "Paper" } }),
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
  return { id: project.id as string, main };
}

const post = (cookie: string, id: string, body: unknown) =>
  postComment(request("POST", `/api/projects/${id}/comments`, { cookie, body }), ctx({ id }));
const list = (cookie: string, id: string) =>
  listComments(request("GET", `/api/projects/${id}/comments`, { cookie }), ctx({ id }));

beforeEach(() => resetRateLimits());
afterAll(() => closeDb());

describe("POST/GET /api/projects/[id]/comments", () => {
  it("creates comments with and without an anchor, and lists filePath and authorName", async () => {
    const owner = await signUp();
    const { id, main } = await newProject(owner.cookie);
    const quote = main.content.slice(0, 30);

    const anchored = await post(owner.cookie, id, {
      fileId: main.id,
      body: "This opening needs a citation",
      anchor: { start: 0, end: 30, quote },
    });
    expect(anchored.status).toBe(201);
    expect(await anchored.json()).toMatchObject({
      comment: {
        fileId: main.id,
        filePath: "main.tex",
        authorName: "Test User",
        parentId: null,
        anchorStart: 0,
        anchorEnd: 30,
        anchorQuote: quote,
        body: "This opening needs a citation",
        resolvedAt: null,
        resolvedBy: null,
      },
    });

    const bare = await post(owner.cookie, id, { fileId: main.id, body: "General note" });
    expect(bare.status).toBe(201);
    expect((await bare.json()).comment).toMatchObject({ anchorStart: null, anchorEnd: null });

    const { comments } = await (await list(owner.cookie, id)).json();
    expect(comments).toHaveLength(2);
    expect(comments.every((c: { filePath: string }) => c.filePath === "main.tex")).toBe(true);
    expect(comments.every((c: { authorId: string }) => typeof c.authorId === "string")).toBe(true);
    expect(
      comments.every((c: { createdAt: string }) => !Number.isNaN(Date.parse(c.createdAt))),
    ).toBe(true);
  });

  it("rejects invalid anchors, oversized quotes and unknown files", async () => {
    const owner = await signUp();
    const { id, main } = await newProject(owner.cookie);
    const len = main.content.length;

    const cases = [
      { start: 0, end: len + 1, quote: "x" }, // beyond the stored content
      { start: -1, end: 5, quote: "x" }, // negative
      { start: 10, end: 5, quote: "x" }, // start after end
      { start: 0, end: 10, quote: "a".repeat(501) }, // quote over 500 chars
    ];
    for (const anchor of cases) {
      const res = await post(owner.cookie, id, { fileId: main.id, body: "b", anchor });
      expect(res.status).toBe(400);
    }
    expect((await post(owner.cookie, id, { fileId: crypto.randomUUID(), body: "b" })).status).toBe(
      404,
    );
    expect((await post(owner.cookie, id, { fileId: main.id, body: "" })).status).toBe(400);
  });

  it("strangers get a uniform 404; a viewer may comment and reply", async () => {
    const owner = await signUp();
    const viewer = await signUp();
    const { id, main } = await newProject(owner.cookie);
    resetRateLimits();

    const stranger = await signUp();
    expect((await list(stranger.cookie, id)).status).toBe(404);
    expect((await post(stranger.cookie, id, { fileId: main.id, body: "hi" })).status).toBe(404);

    const invite = await addMember(
      request("POST", `/api/projects/${id}/members`, {
        cookie: owner.cookie,
        body: { email: viewer.email, role: "viewer" },
      }),
      ctx({ id }),
    );
    expect(invite.status).toBe(201);

    const root = await post(viewer.cookie, id, { fileId: main.id, body: "Viewer remark" });
    expect(root.status).toBe(201);
    const { comment } = await root.json();

    const reply = await post(owner.cookie, id, {
      fileId: main.id,
      body: "Owner answer",
      parentId: comment.id,
    });
    expect(reply.status).toBe(201);
    expect((await reply.json()).comment).toMatchObject({ parentId: comment.id, anchorStart: null });
  });

  it("rejects a reply to a reply and a parent from another project", async () => {
    const owner = await signUp();
    const { id, main } = await newProject(owner.cookie);
    const root = (await (await post(owner.cookie, id, { fileId: main.id, body: "root" })).json())
      .comment;
    const reply = (
      await (
        await post(owner.cookie, id, { fileId: main.id, body: "reply", parentId: root.id })
      ).json()
    ).comment;

    const nested = await post(owner.cookie, id, {
      fileId: main.id,
      body: "reply to reply",
      parentId: reply.id,
    });
    expect(nested.status).toBe(400);

    const other = await newProject((await signUp()).cookie);
    const foreign = await post(owner.cookie, other.id, {
      fileId: other.main.id,
      body: "hijack",
      parentId: root.id, // lives in another project
    });
    expect(foreign.status).toBe(404);
  });

  it("is rate limited to 60 comments per 10 minutes", async () => {
    const owner = await signUp();
    const { id, main } = await newProject(owner.cookie);
    let last = 201;
    for (let i = 0; i < 61; i++)
      last = (await post(owner.cookie, id, { fileId: main.id, body: `c${i}` })).status;
    expect(last).toBe(429);
  });
});
