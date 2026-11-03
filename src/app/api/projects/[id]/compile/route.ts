import { NextResponse } from "next/server";
import { compileProject } from "@/lib/compiler";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { parseLatexLog } from "@/lib/latex-log";
import { getViewableProject, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  enforceRateLimit(`compile:${user.id}`, 20, 60_000);
  const files = await listFilesWithData(project.id);
  const result = await compileProject(
    project.mainFile,
    files.map((f) =>
      f.data
        ? { path: f.path, content: f.data.toString("base64"), encoding: "base64" as const }
        : { path: f.path, content: f.content },
    ),
  );
  return NextResponse.json({ ...result, ...parseLatexLog(result.log) });
});
