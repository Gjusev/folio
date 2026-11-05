import { z } from "zod";
import {
  IMAGE_KINDS,
  buildImageMessages,
  extractLatex,
  sniffImage,
  snippetDocument,
} from "@/lib/ai-image";
import { resolveProjectEndpoint } from "@/lib/ai-policy";
import { recordAiUsage } from "@/lib/ai-usage";
import { compileProject } from "@/lib/compiler";
import { parseLatexLog } from "@/lib/latex-log";
import { enforceRateLimit, fail, HttpError, requireUser, route } from "@/lib/http";
import { streamText } from "@/lib/llm";
import { addAiMessage, getEditableProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/** parseJson has no size cap of its own; the raw text is checked before parsing. */
const MAX_BODY_CHARS = 6_000_000; // ~4 MB of base64 plus JSON overhead
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const body = z.object({
  image: z.string().min(1),
  kind: z.enum(IMAGE_KINDS).default("auto"),
  hint: z.string().trim().max(500).optional(),
});

/**
 * POST { image, kind, hint } → { latex, compiles, error?, unreadable? }.
 * Photo/screenshot/scan → LaTeX through the project's own AI provider, then an
 * honest compile check in the sandbox. The image itself is never stored.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) throw fail(413, "api.ai.image.tooLarge");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw fail(400, "api.common.malformedJson");
  }
  const input = body.parse(parsed);

  // Tolerate a data URL prefix; the type comes from the bytes, never the client.
  const b64 = input.image.replace(/^data:[^,]*;base64,/, "");
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw fail(413, "api.ai.image.tooLarge");
  const mediaType = sniffImage(bytes);
  if (!mediaType) throw fail(415, "api.ai.image.badFormat");

  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  const endpoint = await resolveProjectEndpoint(user.id, project, "draft");
  if (!endpoint) throw fail(503, "api.ai.notConfigured");
  enforceRateLimit(`ai:${user.id}`, 30, 10 * 60_000);

  const messages = buildImageMessages({
    kind: input.kind,
    hint: input.hint,
    image: { mediaType, data: b64 },
  });
  let answer = "";
  try {
    for await (const piece of streamText(messages, req.signal, endpoint)) answer += piece;
  } catch (err) {
    // Most provider refusals here are "model has no vision": say that, not a bare 502.
    if (err instanceof HttpError && err.status === 502) {
      console.error("image route provider error", err.message);
      throw fail(502, "api.ai.image.noVision");
    }
    throw err;
  }

  const latex = extractLatex(answer);
  const unreadable = latex === "" || latex === "% unreadable";

  // Honesty step: compile the snippet in the sandbox. Unreachable ⇒ null (not
  // checked), never a fake "compiles".
  let compiles: boolean | null = null;
  let error: string | undefined;
  if (!unreadable) {
    try {
      const out = await compileProject("snippet.tex", [
        { path: "snippet.tex", content: snippetDocument(latex) },
      ]);
      if (out.ok) compiles = true;
      else {
        compiles = false;
        error = parseLatexLog(out.log).errors[0]?.message;
      }
    } catch {
      compiles = null;
    }
  }

  // Metadata only; the image itself is never persisted.
  await addAiMessage(
    project.id,
    "user",
    "image",
    `[image:${input.kind}] ${input.hint ?? ""}`,
  ).catch(() => {});
  await addAiMessage(project.id, "assistant", "image", latex).catch(() => {});
  await recordAiUsage(project.id, "image", endpoint.model).catch(() => {});

  return Response.json(
    unreadable
      ? { latex: "", compiles: null, unreadable: true }
      : { latex, compiles, ...(error !== undefined ? { error } : {}) },
  );
});
