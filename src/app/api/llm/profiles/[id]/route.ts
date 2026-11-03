import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/http";
import { deleteProfile, updateProfile, type ProfileInput } from "@/lib/llm-profiles";

type Ctx = { params: Promise<{ id: string }> };

const patchBody = z.object({
  label: z.string().min(1).max(60),
  kind: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().min(1).max(300),
  apiKey: z.string().max(400).optional(), // undefined = keep stored key
  models: z.string().min(1).max(600),
  extraJson: z.string().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const input = await parseJson(req, patchBody);
  const profile = await updateProfile(user.id, (await params).id, input satisfies ProfileInput);
  return Response.json({ profile });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  await deleteProfile(user.id, (await params).id);
  return new Response(null, { status: 204 });
});
