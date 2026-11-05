import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveProjectEndpoint } from "@/lib/ai-policy";
import { recordAiUsage } from "@/lib/ai-usage";
import { buildFixMessages, numberedWindow, parseFixPatch } from "@/lib/ai-fix";
import { enforceRateLimit, fail, parseJson, requireUser, route } from "@/lib/http";
import { parseLatexLog } from "@/lib/latex-log";
import { streamText } from "@/lib/llm";
import { addAiMessage, getEditableProject, listFiles } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  log: z.string().max(20_000),
  lang: z.enum(["es", "en", "de"]).optional(),
});

// A compile error turned into a reviewable patch: the server locates the first
// error with file and line in the log, shows the model a numbered window, and
// returns the proposed replacement for the author to accept — the file is not
// touched here. The text comes from the database (the client flushes pending
// saves first), so the model only ever sees this user's own project.
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  const input = await parseJson(req, body);
  const endpoint = await resolveProjectEndpoint(user.id, project, "draft");
  if (!endpoint) throw fail(503, "api.ai.notConfigured");
  enforceRateLimit(`ai:${user.id}`, 30, 10 * 60_000);

  const error = parseLatexLog(input.log).errors.find((e) => e.file && e.line);
  const file =
    error &&
    (await listFiles(project.id)).find(
      (f) => !f.binary && f.path === error.file!.replace(/^\.\//, ""),
    );
  if (!error || !file) throw fail(422, "api.ai.fix.noLocatableError");

  const window = numberedWindow(file.content, error.line!);
  const messages = buildFixMessages(
    {
      path: file.path,
      error: { message: error.message, line: error.line! },
      window,
      logTail: input.log.slice(-4_000),
    },
    input.lang,
  );

  let raw = "";
  for await (const piece of streamText(messages, req.signal, endpoint)) {
    raw += piece;
    if (raw.length > 40_000) break; // a patch is a few KB; runaway guard
  }
  const patch = parseFixPatch(raw, window);
  if (!patch) throw fail(502, "api.ai.fix.badPatch");

  const lines = file.content.replace(/\r\n/g, "\n").split("\n");
  const original = lines.slice(patch.startLine - 1, patch.endLine).join("\n");
  // A no-op is not a fix — re-asking beats showing a diff that changes nothing.
  if (patch.replacement.replace(/\r\n/g, "\n") === original) throw fail(502, "api.ai.fix.badPatch");

  await addAiMessage(project.id, "user", "fix", `[fix] ${error.message}`).catch(() => {});
  await addAiMessage(
    project.id,
    "assistant",
    "fix",
    `${patch.explanation}\n\n\`\`\`latex\n${patch.replacement}\n\`\`\``,
  ).catch(() => {});
  await recordAiUsage(project.id, "fix", endpoint.model).catch(() => {});

  return NextResponse.json({
    explanation: patch.explanation,
    fileId: file.id,
    path: file.path,
    startLine: patch.startLine,
    endLine: patch.endLine,
    original,
    replacement: patch.replacement,
    error: { message: error.message, line: error.line },
  });
});
