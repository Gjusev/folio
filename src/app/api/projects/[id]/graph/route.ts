import { NextResponse } from "next/server";
import { bibDois } from "@/lib/bibtex";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { bibliographyGraph } from "@/lib/papers";
import { getOwnedProject, listFiles } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The whole-bibliography citation graph: the project's own papers and the
 * works they cite, with edges between every pair present — so "who cites whom
 * among my references" is visible at a glance.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);

  const dois = (await listFiles(project.id))
    .filter((f) => f.path.endsWith(".bib"))
    .flatMap((f) => bibDois(f.content))
    .slice(0, 25);
  if (dois.length === 0)
    return NextResponse.json(
      { error: "La bibliografía no tiene DOIs; cita algunos trabajos primero" },
      { status: 400 },
    );
  const graph = await bibliographyGraph(dois);
  return NextResponse.json(graph);
});
