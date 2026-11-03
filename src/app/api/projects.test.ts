import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import {
  DELETE as deleteProject,
  GET as getProject,
  PATCH as patchProject,
} from "@/app/api/projects/[id]/route";
import { POST as createFile } from "@/app/api/projects/[id]/files/route";
import {
  DELETE as deleteFile,
  PATCH as renameFile,
  PUT as saveFile,
} from "@/app/api/projects/[id]/files/[fileId]/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

type FileDto = { id: string; path: string; content: string; version: number };

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
});
