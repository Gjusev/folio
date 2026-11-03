import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { createSnapshot, getOwnedProject, listSnapshots } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ label: z.string().trim().max(120).optional() });

/** Lists the project's saved versions. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  return NextResponse.json({ snapshots: await listSnapshots(project.id) });
});

/** Saves the current text files as one named snapshot. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  const { label } = await parseJson(req, body);
  enforceRateLimit(`snapshots:${user.id}`, 20, 60_000);
  const snapshot = await createSnapshot(project.id, label ?? "");
  return NextResponse.json({ snapshot });
});
