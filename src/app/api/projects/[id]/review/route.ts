import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveProjectEndpoint } from "@/lib/ai-policy";
import { recordAiUsage } from "@/lib/ai-usage";
import { bibKeys } from "@/lib/bibtex";
import { LANGS } from "@/lib/i18n/dictionaries";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { streamChat } from "@/lib/llm";
import { getViewableProject, listFiles } from "@/lib/projects";
import { ASPECTS, RIGORS, buildExcerpt, buildReviewMessages, parseReview } from "@/lib/review";
import { saveReview } from "@/lib/reviews-store";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  lang: z.enum(LANGS),
  aspects: z.array(z.enum(ASPECTS)).min(1).max(ASPECTS.length),
  rigor: z.enum(RIGORS).default("reviewer"),
  focus: z.string().trim().max(300).default(""),
  // "all" or the section ids (`file#n`) the author ticked.
  scope: z.union([z.literal("all"), z.array(z.string().max(300)).min(1).max(300)]),
});

// An AI critique of the manuscript. It never changes a file: it returns
// comments tied to verified lines and saves the run (review + the author's
// chosen filters) to the history. The text sent to the model comes
// from the database (the client flushes pending saves first), so it only ever
// sees this user's own project.
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  const input = await parseJson(req, body);
  const endpoint = await resolveProjectEndpoint(user.id, project, "draft");
  if (!endpoint)
    throw new HttpError(503, "La IA no está configurada (añade un proveedor en Ajustes)");
  enforceRateLimit(`review:${user.id}`, 6, 10 * 60_000);

  const files = (await listFiles(project.id)).map((f) => ({ path: f.path, content: f.content }));
  const aspects = [...new Set(input.aspects)];
  const excerpt = buildExcerpt(files, input.scope);
  if (!excerpt.ranges.length) throw new HttpError(400, "Nada que revisar en esa selección");

  const messages = buildReviewMessages({
    excerpt: excerpt.text,
    aspects,
    rigor: input.rigor,
    lang: input.lang,
    focus: input.focus,
    bibKeys: files.filter((f) => f.path.endsWith(".bib")).flatMap((f) => bibKeys(f.content)),
    truncated: excerpt.truncated,
  });

  let raw = "";
  for await (const piece of streamChat(messages, req.signal, endpoint)) {
    raw += piece;
    if (raw.length > 40_000) break; // a review is a few KB; this is a runaway guard
  }
  const review = parseReview(raw, excerpt.ranges, aspects, files);
  if (!review)
    throw new HttpError(502, "La IA no devolvió una revisión válida. Inténtalo de nuevo");
  await recordAiUsage(project.id, "review", endpoint.model).catch(() => {});

  const savedId = await saveReview({
    projectId: project.id,
    userId: user.id,
    lang: input.lang,
    aspects,
    rigor: input.rigor,
    focus: input.focus,
    result: review,
  });

  return NextResponse.json({
    review,
    meta: { sections: excerpt.ranges.length, truncated: excerpt.truncated, aspects },
    savedId,
  });
});
