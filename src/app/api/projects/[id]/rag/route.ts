import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { getEditableProject, getViewableProject } from "@/lib/projects";
import { deleteRagIndex, indexProject, indexStatus } from "@/lib/rag";

type Ctx = { params: Promise<{ id: string }> };

/** Index status: {files, chunks, updatedAt} or null when nothing is indexed. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  return Response.json({ status: await indexStatus(project.id) });
});

/** Rebuilds the index (editors only): chunk → embed → replace. indexProject
 *  answers 503 without an embedder and 403 when the project's AI policy forbids it. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  enforceRateLimit(`rag:${user.id}`, 6, 3_600_000);
  return Response.json(await indexProject(user.id, project));
});

export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  await deleteRagIndex(project.id);
  return new Response(null, { status: 204 });
});
