import { z } from "zod";
import {
  buildDraftMessages,
  buildPlanMessages,
  enforceCiteKeys,
  parsePlan,
  type AgentPlan,
  type EvidenceItem,
} from "@/lib/ai-prompts";
import { bibKeys, citeKey } from "@/lib/bibtex";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { streamChat } from "@/lib/llm";
import { resolveEndpoint } from "@/lib/llm-profiles";
import { searchPapers } from "@/lib/papers";
import { getFile, getOwnedProject, listFiles, setAiPlan } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  action: z.enum(["draft", "plan"]).default("draft"),
  instruction: z.string().trim().min(8, "Describe qué redactar").max(2000),
  fileId: z.string(),
  length: z.enum(["short", "normal", "long"]).default("normal"),
});

/** Newline-delimited JSON events the panel renders as the run progresses. */
type AgentEvent =
  | { type: "status"; stage: "searching" | "drafting" | "planning" }
  | { type: "evidence"; items: EvidenceItem[]; bibKeys: string[] }
  | { type: "token"; text: string }
  | {
      type: "done";
      latex: string;
      usedKeys: string[];
      newPapers: { source: EvidenceItem["source"]; paperId: string; key: string }[];
    }
  | { type: "plan"; plan: AgentPlan }
  | { type: "error"; message: string };

const EVIDENCE_LIMIT = 12;

/** Spanish/English filler words removed before deriving the keyword query. */
const STOPWORDS = new Set([
  "sobre",
  "trabajos",
  "trabajo",
  "seccion",
  "sección",
  "escribe",
  "escribir",
  "redacta",
  "redactar",
  "capitulo",
  "capítulo",
  "párrafo",
  "parrafo",
  "acerca",
  "tema",
  "hacer",
  "please",
  "write",
  "section",
  "chapter",
  "about",
  "paper",
  "related",
  "work",
  "draft",
  "make",
  "para",
  "como",
  "this",
  "that",
  "with",
  "from",
]);

/**
 * The drafting agent: one bounded run = one literature search + one streamed
 * draft. Citations are structurally constrained: the model may only use keys
 * from the user's .bib or from the retrieved evidence, and any key it invents
 * is stripped server-side before the draft reaches the user.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  const input = await parseJson(req, body);
  enforceRateLimit(`ai:${user.id}`, 30, 10 * 60_000);
  enforceRateLimit(`agent:${user.id}`, 6, 10 * 60_000);
  const endpoint = await resolveEndpoint(user.id, "draft");
  if (!endpoint)
    throw new HttpError(503, "La IA no está configurada (añade un proveedor en Ajustes)");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        // Everything is read server-side; the model only sees this project.
        const file = await getFile(project.id, input.fileId);
        const files = await listFiles(project.id);
        const keys = files
          .filter((f) => f.path.endsWith(".bib"))
          .flatMap((f) => bibKeys(f.content));

        // Plan: one structured outline, no search, persisted on the project.
        if (input.action === "plan") {
          const outline = [...file.content.matchAll(/\\(?:sub)?section\*?\{([^}]*)\}/g)]
            .slice(0, 40)
            .map((m) => m[0]);
          send({ type: "status", stage: "planning" });
          let raw = "";
          for await (const piece of streamChat(
            buildPlanMessages({
              instruction: input.instruction,
              outline,
              bibKeys: keys,
              instructions: project.aiInstructions,
            }),
            req.signal,
            endpoint,
          )) {
            raw += piece;
            send({ type: "token", text: piece });
          }
          const plan = parsePlan(raw, keys);
          if (!plan) throw new HttpError(502, "La IA no devolvió un plan válido; prueba de nuevo");
          await setAiPlan(project.id, plan);
          send({ type: "plan", plan });
          send({ type: "done", latex: "", usedKeys: [], newPapers: [] });
          return;
        }

        send({ type: "status", stage: "searching" });
        let evidence: EvidenceItem[] = [];
        try {
          // Two complementary queries widen the evidence: the instruction
          // itself and its most distinctive words as a keyword query.
          const words = input.instruction
            .toLowerCase()
            .split(/[^a-záéíóúüñ0-9]+/)
            .filter((w) => w.length > 4 && !STOPWORDS.has(w))
            .slice(0, 6)
            .join(" ");
          const queries = [input.instruction.slice(0, 200), words].filter(
            (q, i, all) => q.length >= 8 && all.indexOf(q) === i,
          );
          const pages = await Promise.allSettled(
            queries.map((q) =>
              searchPapers("openalex", {
                q,
                sort: "relevance",
                openAccess: false,
                page: 1,
              }),
            ),
          );
          const seen = new Set<string>();
          evidence = pages
            .flatMap((p) => (p.status === "fulfilled" ? p.value.results : []))
            .filter((p) => {
              if (!p.title || p.authors.length === 0) return false;
              const dedup = p.doi?.toLowerCase() ?? `${p.source}:${p.id}`;
              if (seen.has(dedup)) return false;
              seen.add(dedup);
              return true;
            })
            .slice(0, EVIDENCE_LIMIT)
            .map((p) => ({
              key: citeKey({ authors: p.authors, year: p.year, title: p.title }),
              title: p.title,
              authors: p.authors.slice(0, 6),
              year: p.year,
              source: p.source,
              paperId: p.id,
              inBib: false,
            }))
            // Papers whose generated key already exists are already citable.
            .map((e) => (keys.includes(e.key) ? { ...e, inBib: true } : e));
        } catch {
          // No evidence: the draft proceeds without citations.
        }
        send({ type: "evidence", items: evidence, bibKeys: keys.slice(0, 300) });

        const outline = [...file.content.matchAll(/\\(?:sub)?section\*?\{([^}]*)\}/g)]
          .slice(0, 40)
          .map((m) => m[0]);
        // Without an explicit style sample, the author's own text is the reference:
        // the body between \begin{document} and the first sectioning command.
        const body = /\\begin\{document\}([\s\S]*?)(?:\\(?:sub)?section|\\end\{document\})/.exec(
          file.content,
        )?.[1];
        const documentExcerpt = body?.replace(/\s+/g, " ").trim().slice(0, 2000);

        send({ type: "status", stage: "drafting" });
        const messages = buildDraftMessages({
          instruction: input.instruction,
          filePath: file.path,
          outline,
          bibKeys: keys,
          evidence,
          instructions: project.aiInstructions,
          styleSample: project.aiStyleSample,
          documentExcerpt,
          length: input.length,
        });
        let raw = "";
        for await (const piece of streamChat(messages, req.signal, endpoint)) {
          raw += piece;
          send({ type: "token", text: piece });
        }

        const allowed = [...keys, ...evidence.filter((e) => !e.inBib).map((e) => e.key)];
        const { latex, used } = enforceCiteKeys(
          raw.replace(/```(?:latex|tex)?\n?|```/g, ""),
          allowed,
        );
        const newPapers = evidence
          .filter((e) => !e.inBib && used.includes(e.key))
          .map((e) => ({ source: e.source, paperId: e.paperId, key: e.key }));
        send({ type: "done", latex, usedKeys: used, newPapers });
      } catch (err) {
        const message = err instanceof HttpError ? err.message : "La redacción se interrumpió";
        if (!(err instanceof HttpError)) console.error("agent error", err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
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
