import { z } from "zod";
import {
  buildCritiqueMessages,
  buildDraftMessages,
  buildPlanMessages,
  citationUndefinedKeys,
  enforceCiteKeys,
  inputsInclude,
  insertDraftBeforeEnd,
  parseCritique,
  parsePlan,
  type AgentPlan,
  type EvidenceItem,
} from "@/lib/ai-prompts";
import { bibKeys, citeKey } from "@/lib/bibtex";
import { compileProject } from "@/lib/compiler";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { streamChat } from "@/lib/llm";
import { resolveEndpoint } from "@/lib/llm-profiles";
import { searchPapers } from "@/lib/papers";
import {
  addAiMessage,
  getEditableProject,
  getFile,
  listFiles,
  listFilesWithData,
  setAiPlan,
} from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  action: z.enum(["draft", "plan"]).default("draft"),
  instruction: z.string().trim().min(8, "Describe qué redactar").max(2000),
  fileId: z.string(),
  length: z.enum(["short", "normal", "long"]).default("normal"),
  // Section-driven drafting (from the plan): explicit goal and word budget.
  section: z
    .object({
      title: z.string().trim().min(1).max(200),
      goal: z.string().trim().max(1000),
      words: z.number().int().min(50).max(2000),
    })
    .optional(),
});

/** Newline-delimited JSON events the panel renders as the run progresses. */
type AgentEvent =
  | { type: "status"; stage: "searching" | "drafting" | "planning" | "critiquing" | "verifying" }
  | { type: "evidence"; items: EvidenceItem[]; bibKeys: string[] }
  | { type: "token"; text: string }
  | {
      type: "critique";
      verdict: "ok" | "revise";
      issues: { kind: "evidence" | "citation" | "structure" | "latex"; note: string }[];
    }
  | {
      type: "verify";
      resolved: string[];
      undefinedKeys: string[];
      pendingNew: string[];
      /** Honest reason when verification could not run (compiler down, no \end{document}…). */
      skipped?: string;
    }
  | {
      type: "done";
      latex: string;
      usedKeys: string[];
      newPapers: { source: EvidenceItem["source"]; paperId: string; key: string }[];
      wordCount: number;
      wordBudget?: number;
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
  const project = await getEditableProject(user.id, (await params).id);
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
          await addAiMessage(project.id, "user", "plan", input.instruction).catch(() => {});
          await addAiMessage(project.id, "assistant", "plan", JSON.stringify(plan)).catch(() => {});
          send({ type: "plan", plan });
          send({ type: "done", latex: "", usedKeys: [], newPapers: [], wordCount: 0 });
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
        // Section-driven runs carry their own budget; the length enum is the fallback.
        const budget =
          input.section?.words ??
          (input.length === "short" ? 150 : input.length === "long" ? 700 : 400);
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
          budget: { words: budget },
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
        // Honest count of what was written; the draft is never truncated.
        const wordCount = latex.split(/\s+/).filter(Boolean).length;

        // Critique: best-effort second pass. Any failure means no critique
        // event, never a lost draft.
        let critique: ReturnType<typeof parseCritique> = null;
        try {
          send({ type: "status", stage: "critiquing" });
          let rawCritique = "";
          for await (const piece of streamChat(
            buildCritiqueMessages({
              instruction: input.instruction,
              goal: input.section?.goal,
              budget,
              evidence,
              draft: latex,
            }),
            req.signal,
            endpoint,
          )) {
            rawCritique += piece;
          }
          critique = parseCritique(rawCritique);
        } catch {
          critique = null;
        }
        if (critique) send({ type: "critique", ...critique });

        // Verification: a throwaway compile with the draft inserted before the
        // last \end{document}. The database is never touched; any failure is
        // reported as skipped, never as a lost draft.
        try {
          send({ type: "status", stage: "verifying" });
          const currentFiles = await listFilesWithData(project.id);
          const mainContent = currentFiles.find((f) => f.path === file.path)?.content;
          const skipVerify = (reason: string) =>
            send({
              type: "verify",
              resolved: [],
              undefinedKeys: [],
              pendingNew: [],
              skipped: reason,
            });
          // Honest boundary: if the active file is not part of the tree the
          // compiler builds from the main file, the draft's \cite commands
          // would never reach BibTeX and "resolved" would be a claim we never
          // checked.
          const unreachable =
            mainContent != null &&
            file.path !== project.mainFile &&
            !inputsInclude(
              currentFiles.map((f) => ({ path: f.path, content: f.content })),
              project.mainFile,
              file.path,
            );
          const merged =
            mainContent == null || unreachable ? null : insertDraftBeforeEnd(mainContent, latex);
          if (mainContent == null) skipVerify(`«${file.path}» ya no está en el proyecto`);
          else if (unreachable)
            skipVerify(
              `«${file.path}» no se incluye (\\input/\\include) desde el archivo principal: verificaría citas sin compilarlas`,
            );
          else if (merged == null)
            skipVerify(
              `«${file.path}» no tiene \\end{document}: no se puede verificar insertando el borrador`,
            );
          else {
            const out = await compileProject(
              project.mainFile,
              currentFiles.map((f) =>
                f.path === file.path
                  ? { path: f.path, content: merged }
                  : f.data
                    ? {
                        path: f.path,
                        content: f.data.toString("base64"),
                        encoding: "base64" as const,
                      }
                    : { path: f.path, content: f.content },
              ),
            );
            const undefinedKeys = citationUndefinedKeys(out.log);
            const undefinedSet = new Set(undefinedKeys);
            const newKeySet = new Set(newPapers.map((p) => p.key));
            send({
              type: "verify",
              resolved: used.filter((k) => !undefinedSet.has(k)),
              undefinedKeys,
              // Keys not yet in the .bib: they resolve once the user adds the references.
              pendingNew: undefinedKeys.filter((k) => newKeySet.has(k)),
            });
          }
        } catch (err) {
          const reason =
            err instanceof HttpError ? err.message : "la compilación de verificación falló";
          send({
            type: "verify",
            resolved: [],
            undefinedKeys: [],
            pendingNew: [],
            skipped: reason,
          });
        }

        await addAiMessage(project.id, "user", "draft", input.instruction).catch(() => {});
        await addAiMessage(project.id, "assistant", "draft", latex).catch(() => {});
        send({ type: "done", latex, usedKeys: used, newPapers, wordCount, wordBudget: budget });
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
