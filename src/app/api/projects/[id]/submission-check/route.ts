import { NextResponse } from "next/server";
import { citationHealth } from "@/lib/citation-health";
import { countProject } from "@/lib/compiler";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { getViewableProject, listFiles, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

type Check = { id: string; ok: boolean; detail: string };

/**
 * Honest pre-submission checks over the project as it is stored: citation
 * health, leftover TODOs, referenced figures, abstract/keywords, word count.
 * No venue database — nothing here is invented.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);

  const meta = await listFiles(project.id);
  const files = await listFilesWithData(project.id);
  const checks: Check[] = [];

  // 1. Citations: every key used exists, everything defined is used.
  const health = citationHealth(files.map((f) => ({ path: f.path, content: f.content })));
  checks.push({
    id: "citations",
    ok: health.undefined.length === 0,
    detail:
      health.undefined.length === 0
        ? `${health.cited.length} citas, todas definidas`
        : `Claves sin definir: ${health.undefined.join(", ")}`,
  });
  checks.push({
    id: "unused",
    ok: health.unused.length === 0,
    detail:
      health.unused.length === 0
        ? "Todas las entradas del .bib se citan"
        : `Sin citar (${health.unused.length}): ${health.unused.slice(0, 6).join(", ")}${health.unused.length > 6 ? "…" : ""}`,
  });

  // 2. Leftover markers in .tex sources (comments included: be conservative).
  const todos = files
    .filter((f) => f.path.endsWith(".tex"))
    .flatMap((f) => [...f.content.matchAll(/\\todo\b|\bFIXME\b|\bXXX\b/g)].map(() => f.path));
  checks.push({
    id: "todos",
    ok: todos.length === 0,
    detail:
      todos.length === 0 ? "Sin marcadores pendientes" : `${todos.length} marcadores TODO/FIXME`,
  });

  // 3. Figures referenced from LaTeX vs files present in the project.
  const existing = new Set(meta.map((f) => f.path));
  const missing: string[] = [];
  for (const f of files.filter((x) => x.path.endsWith(".tex"))) {
    const dir = f.path.includes("/") ? `${f.path.slice(0, f.path.lastIndexOf("/"))}/` : "";
    for (const m of f.content.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
      const base = dir + m[1].replace(/^\.\//, "");
      if (![base, `${base}.pdf`, `${base}.png`, `${base}.jpg`].some((p) => existing.has(p)))
        missing.push(m[1]);
    }
  }
  checks.push({
    id: "figures",
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? "Todas las figuras referenciadas existen"
        : `No encontradas: ${[...new Set(missing)].slice(0, 4).join(", ")}`,
  });

  // 4. Abstract and keywords present in the main file (structural sanity).
  const main = files.find((f) => f.path === project.mainFile)?.content ?? "";
  const hasAbstract = /\\begin\{abstract\}/.test(main);
  const hasKeywords = /\\begin\{IEEEkeywords\}|\\keywords\{|\\printkeywords|\\setkeywords/.test(
    main,
  );
  checks.push({
    id: "abstract",
    ok: hasAbstract,
    detail: hasAbstract ? "Resumen presente" : "Falta el resumen",
  });
  checks.push({
    id: "keywords",
    ok: hasKeywords,
    detail: hasKeywords
      ? "Palabras clave presentes"
      : "Sin palabras clave (algunas revistas las piden)",
  });

  // 5. Word count via the isolated compiler (best-effort: omitted if down).
  let words: number | null = null;
  try {
    const r = await countProject(
      project.mainFile,
      files.map((f) => ({ path: f.path, content: f.content })),
    );
    words = r.words ?? null;
  } catch {
    // The compiler may be busy or restarting; the checklist stays useful.
  }

  return NextResponse.json({ checks, words });
});
