import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveProjectEndpoint } from "@/lib/ai-policy";
import { recordAiUsage } from "@/lib/ai-usage";
import { LANGS } from "@/lib/i18n/dictionaries";
import { enforceRateLimit, fail, parseJson, requireUser, route } from "@/lib/http";
import { buildDraftMessages, parseDrafts } from "@/lib/letter";
import { streamText } from "@/lib/llm";
import { getEditableProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        comment: z.string().trim().min(1).max(4000),
        quote: z.string().max(400).optional(),
      }),
    )
    .min(1)
    .max(40),
  lang: z.enum(LANGS),
  context: z.string().max(1000).default(""),
});

// Draft responses for the letter's empty slots. The model never sees the
// manuscript (the drafts are marked as scaffolds in the document itself), and
// anything it answers for an id the author did not send is discarded.
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  const input = await parseJson(req, body);
  const endpoint = await resolveProjectEndpoint(user.id, project, "draft");
  if (!endpoint) throw fail(503, "api.ai.notConfigured");
  enforceRateLimit(`review:${user.id}`, 6, 10 * 60_000);

  let raw = "";
  for await (const piece of streamText(
    buildDraftMessages({ items: input.items, lang: input.lang, context: input.context }),
    req.signal,
    endpoint,
  )) {
    raw += piece;
    if (raw.length > 40_000) break; // drafts are a few KB; runaway guard
  }
  const drafts = parseDrafts(
    raw,
    input.items.map((i) => i.id),
  );
  if (!drafts.length) throw fail(502, "api.letter.badDrafts");
  await recordAiUsage(project.id, "letter-drafts", endpoint.model).catch(() => {});
  return NextResponse.json({ drafts });
});
