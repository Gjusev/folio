import { z } from "zod";
import { enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { getPreferences, saveAppearance, saveOnboarding } from "@/lib/preferences";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return Response.json(await getPreferences(user.id));
});

const putBody = z.object({
  appearance: z
    .object({
      theme: z.enum(["system", "light", "dark"]).optional(),
      uiFont: z.enum(["plex", "switzer", "system"]).optional(),
      fontScale: z.enum(["s", "m", "l"]).optional(),
      editorFont: z.enum(["plex-mono", "system-mono"]).optional(),
    })
    .optional(),
  onboarding: z
    .object({
      done: z.array(z.string()).optional(),
      dismissed: z.boolean().optional(),
    })
    .optional(),
});

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  enforceRateLimit(`preferences:${user.id}`, 30, 10 * 60_000);
  const { appearance, onboarding } = await parseJson(req, putBody);
  if (appearance) await saveAppearance(user.id, appearance);
  if (onboarding) await saveOnboarding(user.id, onboarding);
  return Response.json(await getPreferences(user.id));
});
