import { createServer, type IncomingMessage, type Server } from "node:http";
import { strToU8, unzipSync, zipSync } from "fflate";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as compile } from "@/app/api/projects/[id]/compile/route";
import { GET as exportZip } from "@/app/api/projects/[id]/export/route";
import { PUT as saveFile } from "@/app/api/projects/[id]/files/[fileId]/route";
import { GET as rawFile } from "@/app/api/projects/[id]/files/[fileId]/raw/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { POST as upload } from "@/app/api/projects/[id]/uploads/route";
import { POST as importZip } from "@/app/api/projects/import/route";
import { POST as createProject } from "@/app/api/projects/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

const COMPILER_PORT = 39_125;
vi.hoisted(() => {
  process.env.COMPILER_URL = "http://127.0.0.1:39125";
});

type Sent = { path: string; content: string; encoding?: string };
let compilerRequests: { files: Sent[] }[] = [];
let server: Server;

beforeAll(async () => {
  server = createServer(async (req: IncomingMessage, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    compilerRequests.push(JSON.parse(raw));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, log: "", pdf: "" }));
  });
  await new Promise<void>((r) => server.listen(COMPILER_PORT, "127.0.0.1", () => r()));
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
  compilerRequests = [];
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function multipart(path: string, cookie: string, fields: Record<string, Blob | string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  // Serialise once: the routes now require an exact Content-Length, like a browser.
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

async function newProject() {
  const { cookie } = await signUp();
  const res = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "Figures" } }),
    undefined,
  );
  return { cookie, id: (await res.json()).project.id as string };
}

async function filesOf(cookie: string, id: string) {
  const res = await getProject(request("GET", `/api/projects/${id}`, { cookie }), ctx({ id }));
  return (await res.json()) as {
    project: { mainFile: string };
    files: { path: string; binary: boolean }[];
  };
}

describe("figures", () => {
  it("uploads a PNG, serves it, compiles and exports it", async () => {
    const { cookie, id } = await newProject();
    const res = await upload(
      await multipart(`/api/projects/${id}/uploads`, cookie, {
        file: new File([PNG], "plot one.png", { type: "image/png" }),
        folder: "figures",
      }),
      ctx({ id }),
    );
    expect(res.status).toBe(201);
    const { file } = await res.json();
    expect(file).toMatchObject({ path: "figures/plot-one.png", binary: true, size: PNG.length });

    const raw = await rawFile(
      request("GET", `/api/projects/${id}/files/${file.id}/raw`, { cookie }),
      ctx({ id, fileId: file.id }),
    );
    expect(raw.headers.get("content-type")).toBe("image/png");
    expect(raw.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await raw.arrayBuffer()).equals(PNG)).toBe(true);

    await compile(request("POST", `/api/projects/${id}/compile`, { cookie }), ctx({ id }));
    expect(compilerRequests[0].files.find((f) => f.path === "figures/plot-one.png")).toEqual({
      path: "figures/plot-one.png",
      content: PNG.toString("base64"),
      encoding: "base64",
    });
    expect(compilerRequests[0].files.find((f) => f.path === "main.tex")?.encoding).toBeUndefined();

    const zip = await exportZip(
      request("GET", `/api/projects/${id}/export`, { cookie }),
      ctx({ id }),
    );
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Buffer.from(files["figures/plot-one.png"]).equals(PNG)).toBe(true);

    const edit = await saveFile(
      request("PUT", `/api/projects/${id}/files/${file.id}`, {
        cookie,
        body: { content: "x", baseVersion: 1 },
      }),
      ctx({ id, fileId: file.id }),
    );
    expect(edit.status).toBe(400);
  });

  it("rejects disguised and unsupported uploads", async () => {
    const { cookie, id } = await newProject();
    const send = async (name: string, body: BlobPart) =>
      upload(
        await multipart(`/api/projects/${id}/uploads`, cookie, { file: new File([body], name) }),
        ctx({ id }),
      );
    expect((await send("evil.png", "<script>alert(1)</script>")).status).toBe(400);
    expect((await send("run.sh", "rm -rf /")).status).toBe(400);
    expect((await send("diagram.svg", "<svg/>")).status).toBe(400);
    const tex = await send("appendix.tex", "\\section{Appendix}");
    expect(tex.status).toBe(201);
    expect((await tex.json()).file).toMatchObject({ path: "appendix.tex", binary: false });
  });

  it("does not serve figures across users", async () => {
    const a = await newProject();
    const { file } = await (
      await upload(
        await multipart(`/api/projects/${a.id}/uploads`, a.cookie, {
          file: new File([PNG], "x.png"),
        }),
        ctx({ id: a.id }),
      )
    ).json();
    const b = await signUp();
    const res = await rawFile(
      request("GET", `/api/projects/${a.id}/files/${file.id}/raw`, { cookie: b.cookie }),
      ctx({ id: a.id, fileId: file.id }),
    );
    expect(res.status).toBe(404);
  });
});

describe("import", () => {
  it("creates a project from an Overleaf-style ZIP", async () => {
    const { cookie } = await signUp();
    const zip = zipSync({
      "my-paper/paper.tex": strToU8("\\documentclass{article}\\begin{document}Hi\\end{document}"),
      "my-paper/sections/intro.tex": strToU8("\\section{Intro}"),
      "my-paper/refs.bib": strToU8("@misc{k, title={T}}"),
      "my-paper/figures/a.png": new Uint8Array(PNG),
      "my-paper/paper.aux": strToU8("junk"),
      "my-paper/build.sh": strToU8("echo"),
      "my-paper/__MACOSX/._paper.tex": strToU8("junk"),
    });
    const res = await importZip(
      await multipart("/api/projects/import", cookie, { file: new File([zip], "my-paper.zip") }),
      undefined,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      mainFile: "paper.tex",
      imported: 4,
      skipped: [{ path: "build.sh" }],
      project: { name: "my-paper" },
    });

    const detail = await filesOf(cookie, body.project.id);
    expect(detail.project.mainFile).toBe("paper.tex");
    expect(detail.files.map((f) => f.path)).toEqual([
      "figures/a.png",
      "paper.tex",
      "refs.bib",
      "sections/intro.tex",
    ]);
    expect(detail.files[0].binary).toBe(true);
  });

  it("rejects files that are not usable LaTeX projects", async () => {
    const { cookie } = await signUp();
    const send = async (bytes: Uint8Array<ArrayBuffer>) =>
      importZip(
        await multipart("/api/projects/import", cookie, { file: new File([bytes], "x.zip") }),
        undefined,
      );
    expect((await send(strToU8("not a zip"))).status).toBe(400);
    const noMain = await send(zipSync({ "notes.txt": strToU8("hello") }));
    expect(noMain.status).toBe(400);
    expect((await noMain.json()).error).toMatch(/documentclass/);
  });
});

describe("templates", () => {
  it("creates projects from a chosen template and rejects unknown ones", async () => {
    const { cookie } = await signUp();
    const make = (template: string) =>
      createProject(
        request("POST", "/api/projects", { cookie, body: { name: "T", template } }),
        undefined,
      );
    const thesis = await (await make("thesis")).json();
    const detail = await filesOf(cookie, thesis.project.id);
    expect(detail.files.map((f) => f.path)).toContain("chapters/introduction.tex");
    expect((await make("nope")).status).toBe(400);
  });
});
