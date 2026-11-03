import { NextResponse } from "next/server";
import { citationHealth, titleSimilarity } from "@/lib/citation-health";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { searchPapers } from "@/lib/papers";
import { getViewableProject, listFiles } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const MAX_UPGRADE_LOOKUPS = 5; // one OpenAlex search per candidate, on demand

/**
 * Cross-checks the bibliography against the \cite commands: unused entries,
 * undefined keys, and arXiv preprints whose published version we could find.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);

  const files = (await listFiles(project.id)).map((f) => ({ path: f.path, content: f.content }));
  const health = citationHealth(files);

  // For a handful of arXiv candidates, look for the published version: a
  // different-DOI record with a near-identical title (venue check via type).
  const upgrades: {
    key: string;
    title: string;
    suggestion: {
      source: "openalex";
      paperId: string;
      title: string;
      venue?: string;
      year?: number;
      doi?: string;
      citedBy: number;
    };
  }[] = [];
  for (const c of health.arxiv.slice(0, MAX_UPGRADE_LOOKUPS)) {
    if (!c.title) continue;
    try {
      const r = await searchPapers("openalex", {
        q: c.title,
        sort: "relevance",
        openAccess: false,
        page: 1,
      });
      const best = r.results
        .filter((p) => {
          if (!p.doi || /^10\.48550\/arxiv\./i.test(p.doi)) return false;
          if (titleSimilarity(c.title, p.title) < 0.85) return false;
          // Same first-author family, and published no earlier than the
          // preprint: title twins by other teams are not upgrades.
          if (c.family && p.authors[0]) {
            const family = p.authors[0].split(/\s+/).at(-1)?.toLowerCase();
            if (family !== c.family) return false;
          }
          if (c.year && p.year && (p.year < c.year - 1 || p.year > c.year + 4)) return false;
          return true;
        })
        .sort((a, b) => b.citedBy - a.citedBy)[0];
      if (best)
        upgrades.push({
          key: c.key,
          title: c.title,
          suggestion: {
            source: "openalex",
            paperId: best.id,
            title: best.title,
            venue: best.venue,
            year: best.year,
            doi: best.doi,
            citedBy: best.citedBy,
          },
        });
    } catch {
      // A failed lookup must not sink the whole report.
    }
  }

  return NextResponse.json({
    defined: health.defined.length,
    cited: health.cited.length,
    unused: health.unused,
    undefined: health.undefined,
    upgrades,
  });
});
