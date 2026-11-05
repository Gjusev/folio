import { deleteApiToken, requireSessionUser } from "@/lib/api-tokens";
import { route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireSessionUser(req);
  await deleteApiToken(user.id, (await params).id);
  return new Response(null, { status: 204 });
});
