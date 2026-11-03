import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/http";
import { deleteFile, getOwnedProject, renameFile, saveFile } from "@/lib/projects";
import { fileContent } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

export const PUT = route(async (req, { params }: Ctx) => {
  const { id, fileId } = await params;
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, id);
  const { content, baseVersion } = await parseJson(
    req,
    z.object({ content: fileContent, baseVersion: z.number().int().positive() }),
  );
  return NextResponse.json(await saveFile(project.id, fileId, content, baseVersion));
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id, fileId } = await params;
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, id);
  const { path } = await parseJson(req, z.object({ path: z.string().trim() }));
  await renameFile(project.id, project.mainFile, fileId, path);
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  const { id, fileId } = await params;
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, id);
  await deleteFile(project.id, project.mainFile, fileId);
  return new NextResponse(null, { status: 204 });
});
