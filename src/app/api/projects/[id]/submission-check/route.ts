import { NextResponse } from "next/server";
import { citationHealth } from "@/lib/citation-health";
import { compileProject, countProject } from "@/lib/compiler";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { getViewableProject, listFiles, listFilesWithData } from "@/lib/projects";
import {
  bibStyleMismatch,
  blindSignals,
  getVenue,
  missingRequiredSections,
  pagesFromLog,
} from "@/lib/venues";

type Ctx = { params: Promise<{ id: string }> };

// The detail reaches the client as a message key + vars: the UI translates it
// (the API itself has no locale).
type Check = {
  id: string;
  ok: boolean;
  detail: { code: string; vars?: Record<string, string | number> };
};

/**
 * Honest pre-submission checks over the project as it is stored: citation
 * health, leftover TODOs, referenced figures, abstract/keywords, word count.
 * With ?venue=<id> (src/lib/venues.ts, every rule sourced) extra checks are
 * appended: page count, blind-review signals, required sections, bib style.
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
        ? { code: "check.citations.ok", vars: { n: health.cited.length } }
        : { code: "check.citations.bad", vars: { list: health.undefined.join(", ") } },
  });
  checks.push({
    id: "unused",
    ok: health.unused.length === 0,
    detail:
      health.unused.length === 0
        ? { code: "check.unused.ok" }
        : {
            code: "check.unused.bad",
            vars: {
              n: health.unused.length,
              list: `${health.unused.slice(0, 6).join(", ")}${health.unused.length > 6 ? "…" : ""}`,
            },
          },
  });

  // 2. Leftover markers in .tex sources (comments included: be conservative).
  const todos = files
    .filter((f) => f.path.endsWith(".tex"))
    .flatMap((f) => [...f.content.matchAll(/\\todo\b|\bFIXME\b|\bXXX\b/g)].map(() => f.path));
  checks.push({
    id: "todos",
    ok: todos.length === 0,
    detail:
      todos.length === 0
        ? { code: "check.todos.ok" }
        : { code: "check.todos.bad", vars: { n: todos.length } },
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
        ? { code: "check.figures.ok" }
        : {
            code: "check.figures.bad",
            vars: { list: [...new Set(missing)].slice(0, 4).join(", ") },
          },
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
    detail: hasAbstract ? { code: "check.abstract.ok" } : { code: "check.abstract.bad" },
  });
  checks.push({
    id: "keywords",
    ok: hasKeywords,
    detail: hasKeywords ? { code: "check.keywords.ok" } : { code: "check.keywords.bad" },
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

  // 6. Venue-specific checks (phase 4a). No ?venue (or an unknown id) leaves
  // the response exactly as it has always been — neutral by default.
  const venue = getVenue(new URL(req.url).searchParams.get("venue"));
  if (venue) {
    const texFiles = files.map((f) => ({ path: f.path, content: f.content }));

    // 6a. Page count from the compiled PDF (one best-effort compile, sharing
    // the /compile rate-limit bucket; any failure stays neutral).
    if (venue.pageLimit.value === null) {
      checks.push({ id: "pages", ok: true, detail: { code: "check.pages.nolimit" } });
    } else {
      let pages: number | null = null;
      try {
        enforceRateLimit(`compile:${user.id}`, 20, 60_000);
        const r = await compileProject(
          project.mainFile,
          // Binary files travel base64, exactly like /compile sends them.
          files.map((f) =>
            f.data
              ? { path: f.path, content: f.data.toString("base64"), encoding: "base64" as const }
              : { path: f.path, content: f.content },
          ),
        );
        pages = pagesFromLog(r.log);
      } catch {
        // Compiler busy, rate-limited or a log without a page count: unknown.
      }
      if (pages === null) {
        checks.push({ id: "pages", ok: true, detail: { code: "check.pages.unknown" } });
      } else {
        const limit = venue.pageLimit.value;
        const within = pages <= limit;
        checks.push({
          id: "pages",
          ok: within,
          detail: {
            code: within ? "check.pages.ok" : "check.pages.bad",
            vars: { pages, limit, scope: venue.pageLimit.scope },
          },
        });
      }
    }

    // 6b. De-anonymisation signals, only where review is double-blind.
    if (venue.anonymisation === "double") {
      const signals = blindSignals(texFiles, venue);
      checks.push({
        id: "blind",
        ok: signals.length === 0,
        detail:
          signals.length === 0
            ? { code: "check.blind.ok" }
            : {
                code: "check.blind.bad",
                vars: {
                  n: signals.length,
                  list: signals
                    .slice(0, 3)
                    .map((s) => `${s.file} (${s.kind})`)
                    .join(", "),
                },
              },
      });
    }

    // 6c. Required sections (e.g. ACL's Limitations).
    if (venue.requiredSections.length > 0) {
      const missing = missingRequiredSections(texFiles, venue);
      checks.push({
        id: "sections",
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? { code: "check.sections.ok" }
            : { code: "check.sections.bad", vars: { list: missing.join(", ") } },
      });
    }

    // 6d. Bibliography style expected by the venue (free venues skip it).
    if (venue.bibStyle !== null) {
      const mismatch = bibStyleMismatch(main, venue);
      checks.push({
        id: "bibstyle",
        ok: mismatch === null,
        detail:
          mismatch === null
            ? { code: "check.bibstyle.ok" }
            : mismatch.found === "missing"
              ? { code: "check.bibstyle.missing", vars: { expected: mismatch.expected } }
              : {
                  code: "check.bibstyle.bad",
                  vars: { expected: mismatch.expected, found: mismatch.found },
                },
      });
    }
  }

  return NextResponse.json({ checks, words });
});
