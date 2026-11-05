import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, parseJson, requireUser, route } from "@/lib/http";
import { createProject, listProjects } from "@/lib/projects";
import { findTemplate } from "@/lib/templates";
import { projectName } from "@/lib/validation";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return NextResponse.json({ projects: await listProjects(user.id) });
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { name, template } = await parseJson(
    req,
    z.object({ name: projectName, template: z.string().max(40).optional() }),
  );
  const tpl = findTemplate(template);
  if (!tpl) throw fail(400, "api.projects.unknownTemplate");
  const project = await createProject(user.id, name, tpl.files);
  return NextResponse.json({ project: { id: project.id, name: project.name } }, { status: 201 });
});
