import { z } from "zod";
import { AI_ACTIONS, buildMessages } from "@/lib/ai-prompts";
import { bibKeys } from "@/lib/bibtex";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { streamChat } from "@/lib/llm";
import { anyEndpoint, resolveEndpoint } from "@/lib/llm-profiles";
import { getFile, getOwnedProject, listFiles } from "@/lib/projects";

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
  const project = await getOwnedProject(user.id, (await params).id);
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

  const messages = buildMessages({
    ...input,
    filePath: file.path,
    document: file.content,
    bibKeys: keys,
  });
  const tokens = streamChat(messages, req.signal, endpoint);

  // Pull the first chunk before answering so provider errors map to a real status code.
  const first = await tokens.next();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for await (const piece of tokens) controller.enqueue(encoder.encode(piece));
      } catch (err) {
        const msg = err instanceof HttpError ? err.message : "La respuesta de la IA se interrumpió";
        controller.enqueue(encoder.encode(`\n\n[${msg}]`));
      } finally {
        controller.close();
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

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return Response.json({ enabled: await anyEndpoint(user.id) });
});
