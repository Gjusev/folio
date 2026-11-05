import { z } from "zod";
import { buildDisclosure } from "@/lib/ai-disclosure";
import { listAiUsage } from "@/lib/ai-usage";
import { requireUser, route } from "@/lib/http";
import { LANGS } from "@/lib/i18n/dictionaries";
import { getViewableProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const query = z.object({ lang: z.enum(LANGS).default("en") });

/**
 * The generative-AI declaration for this manuscript, from the project's
 * AI-use ledger: `{ latex, purposes, models, from, to, count }`, or
 * `{ latex: null }` when nothing was recorded. It covers only AI used inside
 * Folio; tools the authors used elsewhere are theirs to declare.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  const { lang } = query.parse(Object.fromEntries(req.nextUrl.searchParams));
  return Response.json(buildDisclosure(await listAiUsage(project.id), lang) ?? { latex: null });
});
