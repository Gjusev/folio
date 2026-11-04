import { HttpError, enforceRateLimit, requireUser, route } from "@/lib/http";
import { resolveEndpoint } from "@/lib/llm-profiles";
import { getEditableProject, getViewableProject } from "@/lib/projects";
import { deleteRagIndex, indexProject, indexStatus } from "@/lib/rag";

type Ctx = { params: Promise<{ id: string }> };

/** Index status: {files, chunks, updatedAt} or null when nothing is indexed. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  return Response.json({ status: await indexStatus(project.id) });
});

/** Rebuilds the index (editors only): chunk → embed → replace. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  enforceRateLimit(`rag:${user.id}`, 6, 3_600_000);
  if (!(await resolveEndpoint(user.id, "embed"))) {
    throw new HttpError(503, "Configura un proveedor con modelo de embeddings en Ajustes");
  }
  return Response.json(await indexProject(user.id, project.id));
});

export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  await deleteRagIndex(project.id);
  return new Response(null, { status: 204 });
});
