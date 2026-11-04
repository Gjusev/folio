import { NextResponse } from "next/server";
import { z } from "zod";
import { demoProject } from "@/lib/demo";
import { LANGS } from "@/lib/i18n/dictionaries";
import { requestLang } from "@/lib/i18n/request";
import { enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { createProject } from "@/lib/projects";

// Creates the localised demo project (a finished paper that compiles) for the
// caller. Idempotence is deliberately NOT enforced: running it twice just gives
// two copies to experiment with, like "duplicate".
export const POST = route(async (req) => {
  const user = await requireUser(req);
  enforceRateLimit(`demo:${user.id}`, 10, 60 * 60 * 1000);
  const { lang } = await parseJson(req, z.object({ lang: z.enum(LANGS).optional() }));
  const demo = demoProject(lang ?? requestLang(req));
  const project = await createProject(user.id, demo.name, demo.files);
  return NextResponse.json({ project: { id: project.id, name: project.name } }, { status: 201 });
});
