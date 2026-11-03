import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { duplicateProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Duplicates a project into a fresh one owned by the caller. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const id = (await params).id;
  enforceRateLimit(`dup:${user.id}`, 10, 60_000);
  const copy = await duplicateProject(user.id, id);
  return Response.json({ project: { id: copy.id, name: copy.name } }, { status: 201 });
});
