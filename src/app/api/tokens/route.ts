import { z } from "zod";
import {
  createApiToken,
  listApiTokens,
  requireSessionUser,
  TOKEN_SCOPES,
} from "@/lib/api-tokens";
import { enforceRateLimit, parseJson, route } from "@/lib/http";

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
