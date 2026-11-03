import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/http";
import { createFile, getOwnedProject } from "@/lib/projects";
import { fileContent } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  const { path, content } = await parseJson(
    req,
    z.object({ path: z.string().trim(), content: fileContent.default("") }),
  );
  const file = await createFile(project.id, { path, content });
  return NextResponse.json({ file }, { status: 201 });
});
