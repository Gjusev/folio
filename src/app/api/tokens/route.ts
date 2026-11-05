import { z } from "zod";
import type { NextRequest } from "next/server";
import {
  authenticateApiRequest,
  createApiToken,
  listApiTokens,
  TOKEN_SCOPES,
} from "@/lib/api-tokens";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";

/** Tokens cannot manage tokens: Bearer callers get 403, only the session may act. */
async function requireSessionUser(req: NextRequest) {
  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    const identity = await authenticateApiRequest(req);
    if (identity?.via === "token")
      throw new HttpError(403, "Los tokens no pueden gestionar tokens");
  }
  return requireUser(req);
}

export const GET = route(async (req) => {
  const user = await requireSessionUser(req);
  return Response.json({ tokens: await listApiTokens(user.id) });
});

const createBody = z.object({
  name: z.string().min(1).max(60),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1),
});

export const POST = route(async (req) => {
  const user = await requireSessionUser(req);
  enforceRateLimit(`tokens:${user.id}`, 30, 10 * 60_000);
  const { name, scopes } = await parseJson(req, createBody);
  // The only time the full token leaves the server.
  return Response.json(await createApiToken(user.id, name, scopes), { status: 201 });
});
