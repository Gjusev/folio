// Integration test against the REAL compiler container (127.0.0.1:3001,
// `pnpm services:up`): the /arxiv packaging only exists there.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { unzipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as arxivRoute } from "@/app/api/projects/[id]/export/arxiv/route";
import { POST as compileRoute } from "@/app/api/projects/[id]/compile/route";
import { POST as createDemo } from "@/app/api/projects/demo/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { PUT as saveFile } from "@/app/api/projects/[id]/files/[fileId]/route";
import { closeDb, db, schema } from "@/lib/db";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../../test/helpers";

// Runs at import time, before any route handler (and its lazy env()) fires:
// point the compiler client at the REAL container like `pnpm dev` does.
try {
  const dotenv = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of dotenv.split("\n")) {
    const m = /^(COMPILER_URL|COMPILER_TOKEN)=(.*)$/.exec(line.trim());
    if (m && m[2]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env: the environment must already carry both */
}

beforeEach(() => resetRateLimits());
afterAll(() => closeDb());

async function demo() {
  const { cookie, email } = await signUp();
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
  const main = (detail.files as { path: string; id: string; version: number }[]).find(
    (f) => f.path === "main.tex",
  )!;
  return { cookie, email, id: project.id as string, main };
}

const post = (cookie: string, id: string) =>
  arxivRoute(request("POST", `/api/projects/${id}/export/arxiv`, { cookie }), ctx({ id }));

describe("POST /api/projects/[id]/export/arxiv", () => {
  it("zips the closure: main.tex, its .bib and the generated .bbl", async () => {
    const { cookie, id } = await demo();
    const res = await post(cookie, id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toMatch(/-arxiv\.zip"$/);
    const names = Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())));
    expect(names).toContain("main.tex");
    expect(names).toContain("references.bib");
    expect(names.some((n) => n.endsWith(".bbl"))).toBe(true);
    // Build artefacts never ship to arXiv.
    expect(names.some((n) => /\.(aux|log|out|blg|fls|fdb_latexmk|synctex\.gz)$/i.test(n))).toBe(
      false,
    );
  }, 120_000);

  it("answers 404 for a stranger", async () => {
    const { id } = await demo();
    const stranger = await signUp();
    expect((await post(stranger.cookie, id)).status).toBe(404);
  });

  it("shares the compile route's rate-limit bucket", async () => {
    const { cookie, email, id } = await demo();
    const [user] = await db()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    // Pre-consume the bucket instead of paying 20 real compiles; the compile
    // route rejecting too proves the bucket (and not a private one) is shared.
    for (let i = 0; i < 20; i++) rateLimit(`compile:${user.id}`, 20, 60_000);
    const compiled = await compileRoute(
      request("POST", `/api/projects/${id}/compile`, { cookie }),
      ctx({ id }),
    );
    expect(compiled.status).toBe(429);
    expect((await post(cookie, id)).status).toBe(429);
  });

  it("answers 422 with the first log error line when the compile fails", async () => {
    const { cookie, id, main } = await demo();
    const saved = await saveFile(
      request("PUT", `/api/projects/${id}/files/${main.id}`, {
        cookie,
        body: {
          content:
            "\\documentclass{article}\n\\begin{document}\n\\thisisnotacommand\n\\end{document}",
          baseVersion: main.version,
        },
      }),
      ctx({ id, fileId: main.id }),
    );
    expect(saved.status).toBe(200);
    const res = await post(cookie, id);
    expect(res.status).toBe(422);
    const { error } = (await res.json()) as { error: string };
    expect(error).toMatch(/main\.tex:\d+/);
  }, 60_000);
});
