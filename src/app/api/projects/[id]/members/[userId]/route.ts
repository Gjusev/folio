import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { getOwnedProject, removeMember } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** Remove a co-author's access. Owner only (owners cannot remove themselves). */
export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, userId } = await params;
  const project = await getOwnedProject(user.id, id);
  enforceRateLimit(`share:${user.id}`, 20, 60_000);
  await removeMember(project.id, userId);
  return new Response(null, { status: 204 });
});
