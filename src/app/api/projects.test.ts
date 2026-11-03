import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as importZip } from "@/app/api/projects/import/route";
import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import {
  DELETE as deleteProject,
  GET as getProject,
  PATCH as patchProject,
} from "@/app/api/projects/[id]/route";
import { GET as citationHealth } from "@/app/api/projects/[id]/citations/health/route";
import { POST as createFile } from "@/app/api/projects/[id]/files/route";
import {
  DELETE as deleteFile,
  PATCH as renameFile,
  PUT as saveFile,
} from "@/app/api/projects/[id]/files/[fileId]/route";
import { GET as listMembers, POST as addMember } from "@/app/api/projects/[id]/members/route";
import { DELETE as removeMember } from "@/app/api/projects/[id]/members/[userId]/route";
import { POST as duplicate } from "@/app/api/projects/[id]/duplicate/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

type FileDto = { id: string; path: string; content: string; version: number };

async function multipart(path: string, cookie: string, fields: Record<string, Blob | string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  // Serialise once: the import route requires an exact Content-Length, like a browser.
  const serialized = new Response(form);
  const body = await serialized.arrayBuffer();
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: "POST",
    headers: {
      cookie,
      "content-type": serialized.headers.get("content-type")!,
      "content-length": String(body.byteLength),
    },
    body,
  });
}

async function newProject(cookie: string, name = "Paper") {
  const res = await createProject(
    request("POST", "/api/projects", { cookie, body: { name } }),
    undefined,
  );
  expect(res.status).toBe(201);
  const { project } = await res.json();
  const detail = await getProject(
    request("GET", `/api/projects/${project.id}`, { cookie }),
    ctx({ id: project.id }),
  );
  const { files } = (await detail.json()) as { files: FileDto[] };
  return { id: project.id as string, files };
}

beforeEach(() => resetRateLimits());
afterAll(() => closeDb());

describe("auth", () => {
  it("registers, logs in, rejects bad passwords and logs out", async () => {
    const { email } = await signUp();

    const dup = await register(
      request("POST", "/api/auth/register", {
        body: { email, name: "X", password: "another long pw" },
      }),
      undefined,
    );
    expect(dup.status).toBe(409);

    const bad = await login(
      request("POST", "/api/auth/login", { body: { email, password: "wrong password" } }),
      undefined,
    );
    expect(bad.status).toBe(401);

    const ok = await login(
      request("POST", "/api/auth/login", {
        body: { email: email.toUpperCase(), password: "correct horse battery" },
      }),
      undefined,
    );
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!.split(";")[0];
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/i);

    expect(
      (await listProjects(request("GET", "/api/projects", { cookie }), undefined)).status,
    ).toBe(200);
    await logout(request("POST", "/api/auth/logout", { cookie }), undefined);
    expect(
      (await listProjects(request("GET", "/api/projects", { cookie }), undefined)).status,
    ).toBe(401);
  });

  it("validates input and rate-limits login attempts", async () => {
    const weak = await register(
      request("POST", "/api/auth/register", {
        body: { email: "a@b.co", name: "A", password: "short" },
      }),
      undefined,
    );
    expect(weak.status).toBe(400);

    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await login(
        request("POST", "/api/auth/login", {
          body: { email: "nobody@example.org", password: "x" },
        }),
        undefined,
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("rejects cross-site mutations", async () => {
    const { cookie } = await signUp();
    const res = await createProject(
      request("POST", "/api/projects", {
        cookie,
        body: { name: "x" },
        headers: { origin: "https://evil.example" },
      }),
      undefined,
    );
    expect(res.status).toBe(403);
  });
});

describe("projects and files", () => {
  it("creates a project from the template and lists it", async () => {
    const { cookie } = await signUp();
    const { id, files } = await newProject(cookie, "My paper");
    expect(files.map((f) => f.path)).toEqual(["main.tex", "references.bib"]);
    expect(files[0].content).toContain("\\documentclass");

    const list = await (
      await listProjects(request("GET", "/api/projects", { cookie }), undefined)
    ).json();
    expect(list.projects).toEqual([expect.objectContaining({ id, name: "My paper", files: 2 })]);

    const renamed = await patchProject(
      request("PATCH", `/api/projects/${id}`, { cookie, body: { name: "Renamed" } }),
      ctx({ id }),
    );
    expect(renamed.status).toBe(200);
  });

  it("saves with optimistic concurrency and never silently overwrites", async () => {
    const { cookie } = await signUp();
    const { id, files } = await newProject(cookie);
    const main = files.find((f) => f.path === "main.tex")!;

    const put = (content: string, baseVersion: number) =>
      saveFile(
        request("PUT", `/api/projects/${id}/files/${main.id}`, {
          cookie,
          body: { content, baseVersion },
        }),
        ctx({ id, fileId: main.id }),
      );

    const first = await put("v2 content", main.version);
    expect(first.status).toBe(200);
    expect((await first.json()).version).toBe(2);

    const stale = await put("stale edit", main.version);
    expect(stale.status).toBe(409);
    expect((await stale.json()).current).toEqual({ content: "v2 content", version: 2 });

    const reloaded = await getProject(
      request("GET", `/api/projects/${id}`, { cookie }),
      ctx({ id }),
    );
    const after = ((await reloaded.json()).files as FileDto[]).find((f) => f.id === main.id)!;
    expect(after.content).toBe("v2 content");
  });

  it("creates, renames and deletes files with path validation", async () => {
    const { cookie } = await signUp();
    const { id, files } = await newProject(cookie);
    const mk = (path: string) =>
      createFile(
        request("POST", `/api/projects/${id}/files`, { cookie, body: { path } }),
        ctx({ id }),
      );

    expect((await mk("../etc/passwd.tex")).status).toBe(400);
    expect((await mk("/abs.tex")).status).toBe(400);
    expect((await mk("latexmkrc")).status).toBe(400);
    expect((await mk("script.sh")).status).toBe(400);
    expect((await mk("main.tex")).status).toBe(409);

    const created = await mk("sections/intro.tex");
    expect(created.status).toBe(201);
    const { file } = await created.json();

    const ren = await renameFile(
      request("PATCH", `/api/projects/${id}/files/${file.id}`, {
        cookie,
        body: { path: "references.bib" },
      }),
      ctx({ id, fileId: file.id }),
    );
    expect(ren.status).toBe(409);

    const main = files.find((f) => f.path === "main.tex")!;
    const delMain = await deleteFile(
      request("DELETE", `/api/projects/${id}/files/${main.id}`, { cookie }),
      ctx({ id, fileId: main.id }),
    );
    expect(delMain.status).toBe(400);

    const del = await deleteFile(
      request("DELETE", `/api/projects/${id}/files/${file.id}`, { cookie }),
      ctx({ id, fileId: file.id }),
    );
    expect(del.status).toBe(204);
  });

  it("isolates projects between users", async () => {
    const alice = await signUp();
    const bob = await signUp();
    const { id, files } = await newProject(alice.cookie);
    const fileId = files[0].id;

    const asBob = { cookie: bob.cookie };
    expect(
      (await getProject(request("GET", `/api/projects/${id}`, asBob), ctx({ id }))).status,
    ).toBe(404);
    expect(
      (
        await saveFile(
          request("PUT", `/api/projects/${id}/files/${fileId}`, {
            ...asBob,
            body: { content: "pwned", baseVersion: 1 },
          }),
          ctx({ id, fileId }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await deleteProject(request("DELETE", `/api/projects/${id}`, asBob), ctx({ id }))).status,
    ).toBe(404);
    expect(
      (
        await getProject(
          request("GET", "/api/projects/not-a-uuid", asBob),
          ctx({ id: "not-a-uuid" }),
        )
      ).status,
    ).toBe(404);

    const list = await (
      await listProjects(request("GET", "/api/projects", asBob), undefined)
    ).json();
    expect(list.projects).toEqual([]);

    expect(
      (await deleteProject(request("DELETE", `/api/projects/${id}`, alice), ctx({ id }))).status,
    ).toBe(204);
  });

  it("imports an OpenAI Prism export ZIP as-is (migration route)", async () => {
    const { cookie } = await signUp();
    const zip = readFileSync(new URL("../../../test/fixtures/prism-export.zip", import.meta.url));
    const res = await importZip(
      await multipart("/api/projects/import", cookie, {
        file: new File([zip], "prism-export.zip", { type: "application/zip" }),
      }),
      undefined,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    // The product metadata folder is tolerated and discarded, not imported.
    expect(body).toMatchObject({
      project: { name: "prism-export" },
      mainFile: "main.tex",
      imported: 3,
      skipped: [{ path: ".prism/meta.json", reason: "formato no admitido" }],
    });

    const detail = await getProject(
      request("GET", `/api/projects/${body.project.id}`, { cookie }),
      ctx({ id: body.project.id }),
    );
    const detailJson = await detail.json();
    expect(detailJson.project.mainFile).toBe("main.tex");
    expect(detailJson.files.map((f: FileDto) => f.path)).toEqual([
      "figures/plot.png",
      "main.tex",
      "references.bib",
    ]);

    const health = await citationHealth(
      request("GET", `/api/projects/${body.project.id}/citations/health`, { cookie }),
      ctx({ id: body.project.id }),
    );
    expect(health.status).toBe(200);
    // All 3 bib keys are cited in main.tex: health 3/3, no ghosts, nothing unused.
    expect(await health.json()).toMatchObject({ defined: 3, cited: 3, unused: [], undefined: [] });
  });
});

describe("sharing and duplication", () => {
  it("shares with a viewer: reads and compiles, but cannot write", async () => {
    const alice = await signUp();
    const bob = await signUp();
    const { id, files } = await newProject(alice.cookie, "Shared paper");
    resetRateLimits();

    // strangers still get a uniform 404
    const stranger = await getProject(
      request("GET", `/api/projects/${id}`, { cookie: bob.cookie }),
      ctx({ id }),
    );
    expect(stranger.status).toBe(404);

    // owner invites bob as viewer
    const invite = await addMember(
      request("POST", `/api/projects/${id}/members`, {
        cookie: alice.cookie,
        body: { email: bob.email, role: "viewer" },
      }),
      ctx({ id }),
    );
    expect(invite.status).toBe(201);

    // viewer: project visible, member list readable? (owner-only) and file save forbidden
    const view = await getProject(
      request("GET", `/api/projects/${id}`, { cookie: bob.cookie }),
      ctx({ id }),
    );
    expect(view.status).toBe(200);
    const members = await listMembers(
      request("GET", `/api/projects/${id}/members`, { cookie: bob.cookie }),
      ctx({ id }),
    );
    expect(members.status).toBe(404); // owner-only, and 404 not 403 (no probing)
    const write = await saveFile(
      request("PUT", `/api/projects/${id}/files/${files[0].id}`, {
        cookie: bob.cookie,
        body: { content: "hack", baseVersion: files[0].version },
      }),
      ctx({ id, fileId: files[0].id }),
    );
    expect(write.status).toBe(403);

    // A viewer CAN duplicate: it creates their own copy of content they can
    // already export — same trust level, no write on the original.
    const dupAsBob = await duplicate(
      request("POST", `/api/projects/${id}/duplicate`, { cookie: bob.cookie }),
      ctx({ id }),
    );
    expect(dupAsBob.status).toBe(201);
    const { project: bobsCopy } = await dupAsBob.json();
    const bobsView = await getProject(
      request("GET", `/api/projects/${bobsCopy.id}`, { cookie: bob.cookie }),
      ctx({ id: bobsCopy.id }),
    );
    expect(bobsView.status).toBe(200);
    const dup = await duplicate(
      request("POST", `/api/projects/${id}/duplicate`, { cookie: alice.cookie }),
      ctx({ id }),
    );
    expect(dup.status).toBe(201);
    const { project: copy } = await dup.json();
    const copyDetail = await getProject(
      request("GET", `/api/projects/${copy.id}`, { cookie: alice.cookie }),
      ctx({ id: copy.id }),
    );
    const copyJson = await copyDetail.json();
    expect(copyJson.project.name).toContain("copia");
    expect(copyJson.files.map((f: FileDto) => f.path).length).toBe(files.length);
  });

  it("an editor can write but not manage members; removal revokes access", async () => {
    const alice = await signUp();
    const carol = await signUp();
    const { id, files } = await newProject(alice.cookie, "Editor paper");
    resetRateLimits();

    await addMember(
      request("POST", `/api/projects/${id}/members`, {
        cookie: alice.cookie,
        body: { email: carol.email, role: "editor" },
      }),
      ctx({ id }),
    );

    // editor writes fine
    const write = await saveFile(
      request("PUT", `/api/projects/${id}/files/${files[0].id}`, {
        cookie: carol.cookie,
        body: { content: "% editor edit\n", baseVersion: files[0].version },
      }),
      ctx({ id, fileId: files[0].id }),
    );
    expect(write.status).toBe(200);

    // editor cannot invite (owner-only) nor share-list
    const invite = await addMember(
      request("POST", `/api/projects/${id}/members`, {
        cookie: carol.cookie,
        body: { email: "nobody@t.dev", role: "viewer" },
      }),
      ctx({ id }),
    );
    expect(invite.status).toBe(404);

    // owner lists members and removes the editor
    const list = await listMembers(
      request("GET", `/api/projects/${id}/members`, { cookie: alice.cookie }),
      ctx({ id }),
    );
    const { members } = await list.json();
    expect(members).toHaveLength(1);
    expect(members[0].email).toBe(carol.email);
    const del = await removeMember(
      request("DELETE", `/api/projects/${id}/members/${members[0].userId}`, {
        cookie: alice.cookie,
      }),
      ctx({ id, userId: members[0].userId }),
    );
    expect(del.status).toBe(204);

    // removed editor is a stranger again: uniform 404
    const after = await getProject(
      request("GET", `/api/projects/${id}`, { cookie: carol.cookie }),
      ctx({ id }),
    );
    expect(after.status).toBe(404);
  });

  it("shared projects appear in the dashboard list with their role", async () => {
    const alice = await signUp();
    const dave = await signUp();
    const { id } = await newProject(alice.cookie, "Visible to dave");
    resetRateLimits();
    await addMember(
      request("POST", `/api/projects/${id}/members`, {
        cookie: alice.cookie,
        body: { email: dave.email, role: "viewer" },
      }),
      ctx({ id }),
    );
    const list = await listProjects(
      request("GET", "/api/projects", { cookie: dave.cookie }),
      undefined,
    );
    const { projects } = await list.json();
    const hit = projects.find((p: { id: string }) => p.id === id);
    expect(hit?.role).toBe("viewer");
  });
});
