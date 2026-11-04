import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postComment } from "@/app/api/projects/[id]/comments/route";
import { POST as reopen } from "@/app/api/projects/[id]/comments/[cid]/reopen/route";
import { POST as resolve } from "@/app/api/projects/[id]/comments/[cid]/resolve/route";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { GET as listMembers, POST as addMember } from "@/app/api/projects/[id]/members/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../../../test/helpers";

type FileDto = { id: string; path: string };

/** Owner + viewer on a fresh project with one viewer comment. */
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
  const { owner: ownerRow } = (await (
    await listMembers(
      request("GET", `/api/projects/${id}/members`, { cookie: owner.cookie }),
      ctx({ id }),
    )
  ).json()) as { owner: { userId: string } };

  const comment = (
    (await (
      await postComment(
        request("POST", `/api/projects/${id}/comments`, {
          cookie: viewer.cookie,
          body: { fileId: main.id, body: "Resolve me" },
        }),
        ctx({ id }),
      )
    ).json()) as { comment: { id: string } }
  ).comment;

  const hit =
    (action: "resolve" | "reopen", route: typeof resolve) =>
    (cookie: string, cid = comment.id) =>
      route(
        request("POST", `/api/projects/${id}/comments/${cid}/${action}`, { cookie }),
        ctx({ id, cid }),
      );
  return {
    ownerId: ownerRow.userId,
    resolveHit: hit("resolve", resolve),
    reopenHit: hit("reopen", reopen),
    viewer,
    owner,
  };
}

beforeEach(() => resetRateLimits());
afterAll(() => closeDb());

describe("resolve/reopen /api/projects/[id]/comments/[cid]", () => {
  it("viewer cannot resolve (403) and strangers do not even see it (404)", async () => {
    const { viewer, resolveHit } = await setup();
    expect((await resolveHit(viewer.cookie)).status).toBe(403);
    const stranger = await signUp();
    expect((await resolveHit(stranger.cookie)).status).toBe(404);
  });

  it("the owner resolves (resolvedBy = owner) and reopens", async () => {
    const { ownerId, owner, resolveHit, reopenHit } = await setup();
    const resolved = await resolveHit(owner.cookie);
    expect(resolved.status).toBe(200);
    const dto = (await resolved.json()).comment;
    expect(dto.resolvedAt).toBeTruthy();
    expect(dto.resolvedBy).toBe(ownerId);

    const reopened = await reopenHit(owner.cookie);
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).comment).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });

  it("404s for a comment id that does not exist", async () => {
    const { owner, resolveHit } = await setup();
    expect((await resolveHit(owner.cookie, crypto.randomUUID())).status).toBe(404);
  });
});
