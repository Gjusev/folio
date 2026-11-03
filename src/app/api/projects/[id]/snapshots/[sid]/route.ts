import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/http";
import { deleteSnapshot, getOwnedProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string; sid: string }> };

export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, sid } = await params;
  const project = await getOwnedProject(user.id, id);
  await deleteSnapshot(project.id, sid);
  return NextResponse.json({ ok: true });
});
