import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/http";
import {
  deleteProject,
  getEditableProject,
  getOwnedProject,
  getViewableProject,
  listFiles,
  renameProject,
  setAiSteering,
  setMainFile,
} from "@/lib/projects";
import { projectName } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  return NextResponse.json({ project, files: await listFiles(project.id) });
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  const { name, mainFile, aiInstructions, aiStyleSample } = await parseJson(
    req,
    z
      .object({
        name: projectName.optional(),
        mainFile: z.string().max(200).optional(),
        aiInstructions: z.string().max(4000).nullable().optional(),
        aiStyleSample: z.string().max(4000).nullable().optional(),
      })
      .refine(
        (b) =>
          b.name !== undefined ||
          b.mainFile !== undefined ||
          b.aiInstructions !== undefined ||
          b.aiStyleSample !== undefined,
        "Nada que cambiar",
      ),
  );
  if (name !== undefined) await renameProject(project.id, name);
  if (mainFile !== undefined) await setMainFile(project.id, mainFile);
  if (aiInstructions !== undefined || aiStyleSample !== undefined) {
    await setAiSteering(project.id, {
      ...(aiInstructions !== undefined ? { aiInstructions } : {}),
      ...(aiStyleSample !== undefined ? { aiStyleSample } : {}),
    });
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  await deleteProject(project.id);
  return new NextResponse(null, { status: 204 });
});
