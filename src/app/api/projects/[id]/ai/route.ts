import { z } from "zod";
import { asPolicy, resolveProjectEndpoint } from "@/lib/ai-policy";
import { AI_ACTIONS, buildMessages } from "@/lib/ai-prompts";
import { recordAiUsage } from "@/lib/ai-usage";
import { bibKeys } from "@/lib/bibtex";
import {
  enforceRateLimit,
  fail,
  HttpError,
  parseJson,
  reqDict,
  requireUser,
  route,
} from "@/lib/http";
import { format } from "@/lib/i18n/dictionaries";
import { streamChat, type StreamChunk } from "@/lib/llm";
import { indexStatus, retrieve } from "@/lib/rag";
import {
  addAiMessage,
  getFile,
  getViewableProject,
  listAiMessages,
  listFiles,
} from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  action: z.enum(AI_ACTIONS),
  fileId: z.string(),
  selection: z.string().max(20_000).default(""),
  beforeCursor: z.string().max(4_000).default(""),
  instruction: z.string().trim().max(4_000).default(""),
  log: z.string().max(20_000).default(""),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) }))
    .max(12)
    .default([]),
});

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  const input = await parseJson(req, body);
  const endpoint = await resolveProjectEndpoint(user.id, project, "draft");
  if (!endpoint) throw fail(503, "api.ai.notConfigured");
  if (input.action === "ask" && !input.instruction) throw fail(400, "api.ai.needInstruction");
  if ((input.action === "improve" || input.action === "explain") && !input.selection.trim()) {
    throw fail(400, "api.ai.needSelection");
  }
  enforceRateLimit(`ai:${user.id}`, 30, 10 * 60_000);

  // The document is read from the database (the client flushes pending saves
  // first), so the model only ever sees this user's own project.
  const file = await getFile(project.id, input.fileId);
  const keys = (await listFiles(project.id))
    .filter((f) => f.path.endsWith(".bib"))
    .flatMap((f) => bibKeys(f.content))
    .slice(0, 300);

  // RAG, best effort: top-8 chunks of the project's index for the instruction.
  // Any failure (no index, no embedder, provider hiccup) leaves the chat intact.
  let projectContext: { file: string; content: string }[] | undefined;
  if (input.instruction) {
    try {
      if (await indexStatus(project.id)) {
        const found = await retrieve(user.id, project, input.instruction);
        if (found.length)
          projectContext = found.map(({ file: f, content }) => ({ file: f, content }));
      }
    } catch {
      /* silent by design: the chat works without retrieved fragments */
    }
  }

  const messages = buildMessages({
    ...input,
    filePath: file.path,
    document: file.content,
    bibKeys: keys,
    projectContext,
  });
  const tokens = streamChat(messages, req.signal, endpoint);

  // Pull the first chunk before answering so provider errors map to a real status code.
  const first = await tokens.next();
  const encoder = new TextEncoder();
  const dict = reqDict(req);
  // One JSON frame per line: {"t":"think"|"text","s":"…"}. Thinking is
  // ephemeral by design: only the text answer is ever persisted.
  const frame = (c: StreamChunk) =>
    encoder.encode(
      `${JSON.stringify({ t: c.kind === "thinking" ? "think" : "text", s: c.text })}\n`,
    );
  let full = "";
  const take = (c: StreamChunk) => {
    if (c.kind === "text") full += c.text;
    return frame(c);
  };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(take(first.value));
        for await (const piece of tokens) controller.enqueue(take(piece));
      } catch (err) {
        const msg =
          err instanceof HttpError ? err.message : format(dict, "api.ai.responseInterrupted");
        // Mid-stream failures ride the same frame shape so the reader stays one loop.
        controller.enqueue(frame({ kind: "text", text: `\n\n[${msg}]` }));
      } finally {
        controller.close();
        // Persist the turn so the conversation survives reloads.
        if (full.trim()) {
          const prompt = input.instruction || `[${input.action}]`;
          await addAiMessage(project.id, "user", input.action, prompt).catch(() => {});
          await addAiMessage(project.id, "assistant", input.action, full).catch(() => {});
          await recordAiUsage(project.id, input.action, endpoint.model).catch(() => {});
        }
      }
    },
    cancel() {
      void tokens.return(undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
});

export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  const project = await getViewableProject(user.id, id);
  const messages = await listAiMessages(project.id);
  const policy = asPolicy(project.aiPolicy);
  // `blocked` says the owner's policy, not a missing provider, is what keeps
  // AI off for this user (their own key is remote under "local").
  let enabled = false;
  let blocked: "off" | "local" | undefined;
  try {
    enabled = (await resolveProjectEndpoint(user.id, project, "draft")) !== null;
  } catch (err) {
    if (!(err instanceof HttpError && err.status === 403)) throw err;
    blocked = policy === "off" ? "off" : "local";
  }
  return Response.json({ enabled, policy, blocked, messages });
});
