import type { NextRequest } from "next/server";
import { authenticateApiRequest, deleteApiToken } from "@/lib/api-tokens";
import { HttpError, requireUser, route } from "@/lib/http";

/** Tokens cannot manage tokens: Bearer callers get 403, only the session may act. */
async function requireSessionUser(req: NextRequest) {
  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    const identity = await authenticateApiRequest(req);
    if (identity?.via === "token")
      throw new HttpError(403, "Los tokens no pueden gestionar tokens");
  }
  return requireUser(req);
}

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireSessionUser(req);
  await deleteApiToken(user.id, (await params).id);
  return new Response(null, { status: 204 });
});
