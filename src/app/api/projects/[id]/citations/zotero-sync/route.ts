import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { unseal } from "@/lib/sealed";
import { createFile, getEditableProject, getFile, listFiles, saveFile } from "@/lib/projects";
import { fetchBibtex, mergeBibtex, type ZoteroCreds } from "@/lib/zotero";

type Ctx = { params: Promise<{ id: string }> };

// Zotero collection keys are 8 uppercase alphanumerics (e.g. N7W92H48).
const body = z.object({
  collection: z
    .string()
    .regex(/^[A-Z0-9]{8}$/, "Colección de Zotero no válida")
    .optional(),
  all: z.boolean().optional(), // explicit in the UI; same as omitting `collection`
});

/**
 * Pulls BibTeX from Zotero (one collection or the whole library) and merges it
 * entry by entry into the project's first .bib (creating references.bib if
 * none), deduplicating by DOI/title via addBibEntry.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  const { collection } = await parseJson(req, body);
  enforceRateLimit(`zotero:${user.id}`, 10, 600_000);

  const [row] = await db()
    .select({ dataEnc: schema.integrations.dataEnc })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.userId, user.id), eq(schema.integrations.kind, "zotero")))
    .limit(1);
  if (!row) throw new HttpError(400, "Conecta Zotero en Ajustes antes de sincronizar");
  let creds: ZoteroCreds;
  try {
    creds = JSON.parse(unseal(row.dataEnc)) as ZoteroCreds;
  } catch {
    throw new HttpError(400, "No se pudo leer tu clave de Zotero; reintrodúcela en Ajustes");
  }

  const incoming = await fetchBibtex(creds, collection);

  const bibs = (await listFiles(project.id)).filter((f) => f.path.endsWith(".bib"));
  const bib =
    bibs.find((f) => f.path === "references.bib") ??
    bibs[0] ??
    (await createFile(project.id, { path: "references.bib", content: "" }));

  // Read-modify-write guarded by the file version; retry once if a save raced us.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await getFile(project.id, bib.id);
    const { content, added, duplicates } = mergeBibtex(current.content, incoming);
    if (added === 0) return NextResponse.json({ added, duplicates, file: pick(current) });
    try {
      const saved = await saveFile(project.id, current.id, content, current.version);
      return NextResponse.json({
        added,
        duplicates,
        file: { ...pick(current), content, version: saved.version },
      });
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 409) || attempt === 1) throw err;
    }
  }
  throw new HttpError(409, "No se pudo actualizar la bibliografía");
});

const pick = (f: { id: string; path: string; content: string; version: number }) => ({
  id: f.id,
  path: f.path,
  content: f.content,
  version: f.version,
  binary: false,
  size: Buffer.byteLength(f.content),
});
