import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/http";
import { attachToProject, detachFromProject } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ projectId: z.uuid() });

/** Indexes the paper's extracted text into the project's RAG chunks and records
 *  the link (idempotent). Requires edit access to the project. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { projectId } = await parseJson(req, body);
  const result = await attachToProject(user.id, (await params).id, projectId);
  return NextResponse.json(result);
});

/** Removes the link and the chunks the attachment had added to the project. */
export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { projectId } = await parseJson(req, body);
  const result = await detachFromProject(user.id, (await params).id, projectId);
  return NextResponse.json(result);
});
