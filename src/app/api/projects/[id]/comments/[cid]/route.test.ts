import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listComments, POST as postComment } from "@/app/api/projects/[id]/comments/route";
import {
  DELETE as deleteComment,
  PATCH as patchComment,
} from "@/app/api/projects/[id]/comments/[cid]/route";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { POST as addMember } from "@/app/api/projects/[id]/members/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../../test/helpers";

type FileDto = { id: string; path: string; content: string };
type Comment = { id: string; authorId: string };

/** Owner + viewer on a fresh project; both can comment. Returns helpers bound
 *  to the project so tests read like the drawer's actions. */
async function setup() {
  const owner = await signUp();
  const viewer = await signUp();
  const created = await createProjectRoute(
    request("POST", "/api/projects", { cookie: owner.cookie, body: { name: "Paper" } }),
    undefined,
  );
  const { project } = await created.json();
  const id = project.id as string;
  const detail = await (
    await getProject(request("GET", `/api/projects/${id}`, { cookie: owner.cookie }), ctx({ id }))
  ).json();
  const main = (detail.files as FileDto[]).find((f) => f.path === "main.tex")!;

  const invite = await addMember(
    request("POST", `/api/projects/${id}/members`, {
      cookie: owner.cookie,
      body: { email: viewer.email, role: "viewer" },
    }),
    ctx({ id }),
  );
  expect(invite.status).toBe(201);

  const post = (cookie: string, body: unknown) =>
    postComment(request("POST", `/api/projects/${id}/comments`, { cookie, body }), ctx({ id }));
  const root = async (cookie: string, body = "root") =>
    (await (await post(cookie, { fileId: main.id, body })).json()).comment as Comment;
  const reply = async (cookie: string, parentId: string, body = "reply") =>
    (await (await post(cookie, { fileId: main.id, body, parentId })).json()).comment as Comment;
  const patch = (cookie: string, cid: string, body: string) =>
    patchComment(
      request("PATCH", `/api/projects/${id}/comments/${cid}`, { cookie, body: { body } }),
      ctx({ id, cid }),
    );
  const del = (cookie: string, cid: string) =>
    deleteComment(
      request("DELETE", `/api/projects/${id}/comments/${cid}`, { cookie }),
      ctx({ id, cid }),
    );
  const ids = async (cookie: string) =>
    (
      (await (
        await listComments(request("GET", `/api/projects/${id}/comments`, { cookie }), ctx({ id }))
      ).json()) as { comments: { id: string }[] }
    ).comments.map((c) => c.id);

  return { id, main, owner, viewer, post, root, reply, patch, del, ids };
}

beforeEach(() => resetRateLimits());
afterAll(() => closeDb());

describe("PATCH /api/projects/[id]/comments/[cid]", () => {
  it("lets the author edit, blocks other members, hides from strangers", async () => {
    const { owner, viewer, root, patch } = await setup();
    const comment = await root(viewer.cookie, "First draft of the remark");

    const edited = await patch(viewer.cookie, comment.id, "Edited remark");
    expect(edited.status).toBe(200);
    expect((await edited.json()).comment).toMatchObject({ id: comment.id, body: "Edited remark" });

    expect((await patch(owner.cookie, comment.id, "censored")).status).toBe(403); // not the author
    const stranger = await signUp();
    expect((await patch(stranger.cookie, comment.id, "hijack")).status).toBe(404);
    expect((await patch(owner.cookie, crypto.randomUUID(), "x")).status).toBe(404);
  });
});

describe("DELETE /api/projects/[id]/comments/[cid]", () => {
  it("owner deletes someone else's thread and the replies cascade", async () => {
    const { owner, viewer, root, reply, del, ids } = await setup();
    const rootComment = await root(viewer.cookie, "Thread to remove");
    const replyComment = await reply(owner.cookie, rootComment.id, "Owner answer");

    const res = await del(owner.cookie, rootComment.id); // owner, not the author
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const left = await ids(owner.cookie);
    expect(left).not.toContain(rootComment.id);
    expect(left).not.toContain(replyComment.id);
  });

  it("blocks non-authors who are not the owner; strangers see 404; authors may delete", async () => {
    const { owner, viewer, root, del } = await setup();
    const ownerComment = await root(owner.cookie, "Owner note");
    const viewerComment = await root(viewer.cookie, "Viewer note");

    expect((await del(viewer.cookie, ownerComment.id)).status).toBe(403); // neither author nor owner
    const stranger = await signUp();
    expect((await del(stranger.cookie, ownerComment.id)).status).toBe(404);
    expect((await del(viewer.cookie, viewerComment.id)).status).toBe(200); // own comment
  });
});
