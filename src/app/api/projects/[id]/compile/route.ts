import { NextResponse } from "next/server";
import { z } from "zod";
import { compileProject } from "@/lib/compiler";
import { enforceRateLimit, fail, requireUser, route } from "@/lib/http";
import { parseLatexLog } from "@/lib/latex-log";
import { getViewableProject, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ mainFile: z.string().trim().min(1).max(200).optional() });

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  enforceRateLimit(`compile:${user.id}`, 20, 60_000);
  // Callers may POST with no body at all (the workspace Compile button); an
  // explicit {mainFile} compiles another .tex of the project instead.
  let payload: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw fail(400, "api.common.malformedJson");
    }
  }
  const { mainFile } = body.parse(payload);

  const files = await listFilesWithData(project.id);
  let root = project.mainFile;
  if (mainFile !== undefined) {
    if (!mainFile.endsWith(".tex") || !files.some((f) => f.path === mainFile)) {
      throw fail(400, "api.compile.badMain", { path: mainFile });
    }
    root = mainFile;
  }
  const result = await compileProject(
    root,
    files.map((f) =>
      f.data
        ? { path: f.path, content: f.data.toString("base64"), encoding: "base64" as const }
        : { path: f.path, content: f.content },
    ),
  );
  // "Output written on main.pdf (3 pages, 12345 bytes)." — the page count the
  // UI shows next to a finished compile.
  const pages = /Output written on \S+ \((\d+) pages?/.exec(result.log);
  return NextResponse.json({
    ...result,
    ...parseLatexLog(result.log),
    pages: result.ok && pages ? Number(pages[1]) : undefined,
  });
});
