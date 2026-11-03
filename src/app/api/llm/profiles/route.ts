import { z } from "zod";
import { enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { createProfile, listProfiles, type ProfileInput } from "@/lib/llm-profiles";
import { sealConfigured } from "@/lib/sealed";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return Response.json({ profiles: await listProfiles(user.id), sealConfigured: sealConfigured() });
});

const createBody = z.object({
  label: z.string().min(1).max(60),
  kind: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().min(1).max(300),
  apiKey: z.string().max(400).optional(),
  models: z.string().min(1).max(600),
  extraJson: z.string().max(2000).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  enforceRateLimit(`llm-profiles:${user.id}`, 30, 10 * 60_000);
  const input = await parseJson(req, createBody);
  const profile = await createProfile(user.id, input satisfies ProfileInput);
  return Response.json({ profile }, { status: 201 });
});
