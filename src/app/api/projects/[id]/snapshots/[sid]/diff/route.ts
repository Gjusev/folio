import { NextResponse } from "next/server";
import { diffProject } from "@/lib/compiler";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { parseLatexLog } from "@/lib/latex-log";
import { getSnapshotFiles, getViewableProject, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string; sid: string }> };

/** Compiles the visual diff (latexdiff) between a snapshot and the present. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, sid } = await params;
  const project = await getViewableProject(user.id, id);
  enforceRateLimit(`compile:${user.id}`, 20, 60_000);
  const snap = await getSnapshotFiles(project.id, sid);
  const oldFiles = Object.entries(snap).map(([path, content]) => ({ path, content }));
  const current = await listFilesWithData(project.id);
  const newFiles = current.map((f) =>
    f.data
      ? { path: f.path, content: f.data.toString("base64"), encoding: "base64" as const }
      : { path: f.path, content: f.content },
  );
  const result = await diffProject(project.mainFile, oldFiles, newFiles);
  return NextResponse.json({ ...result, ...parseLatexLog(result.log) });
});
