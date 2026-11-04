import { z } from "zod";
import { AI_ACTIONS, buildMessages } from "@/lib/ai-prompts";
import { bibKeys } from "@/lib/bibtex";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { streamChat } from "@/lib/llm";
import { anyEndpoint, resolveEndpoint } from "@/lib/llm-profiles";
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
  const endpoint = await resolveEndpoint(user.id, "draft");
  if (!endpoint)
    throw new HttpError(503, "La IA no está configurada (añade un proveedor en Ajustes)");
  if (input.action === "ask" && !input.instruction)
    throw new HttpError(400, "Escribe una petición");
  if ((input.action === "improve" || input.action === "explain") && !input.selection.trim()) {
    throw new HttpError(400, "Selecciona un fragmento del documento");
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
        const found = await retrieve(user.id, project.id, input.instruction);
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
  let full = first.done ? "" : first.value;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for await (const piece of tokens) {
          full += piece;
          controller.enqueue(encoder.encode(piece));
        }
      } catch (err) {
        const msg = err instanceof HttpError ? err.message : "La respuesta de la IA se interrumpió";
        controller.enqueue(encoder.encode(`\n\n[${msg}]`));
      } finally {
        controller.close();
        // Persist the turn so the conversation survives reloads.
        if (full.trim()) {
          const prompt = input.instruction || `[${input.action}]`;
          await addAiMessage(project.id, "user", input.action, prompt).catch(() => {});
          await addAiMessage(project.id, "assistant", input.action, full).catch(() => {});
        }
      }
    },
    cancel() {
      void tokens.return(undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
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
  return Response.json({ enabled: await anyEndpoint(user.id), messages });
});
