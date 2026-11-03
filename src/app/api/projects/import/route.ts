import { NextResponse } from "next/server";
import { HttpError, enforceRateLimit, requireUser, route } from "@/lib/http";
import { ImportError, readProjectZip } from "@/lib/importer";
import { createProject } from "@/lib/projects";
import { projectName } from "@/lib/validation";

const MAX_ZIP_BYTES = 30_000_000;

/** Creates a project from a ZIP of LaTeX sources (Overleaf, Prism or arXiv export). */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  // migración por lotes desde Prism/Overleaf
  enforceRateLimit(`import:${user.id}`, 30, 10 * 60_000);
  // Fail closed on chunked/missing lengths (see uploads route).
  const length = Number(req.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0) {
    throw new HttpError(411, "Se requiere Content-Length");
  }
  if (length > MAX_ZIP_BYTES + 64_000) {
    throw new HttpError(413, "El ZIP supera 30 MB");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Se esperaba un formulario con un archivo ZIP");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Falta el archivo ZIP");
  if (file.size > MAX_ZIP_BYTES) throw new HttpError(413, "El ZIP supera 30 MB");
  const name = projectName.parse(
    String(form.get("name") ?? "").trim() ||
      file.name.replace(/\.zip$/i, "") ||
      "Proyecto importado",
  );
  let imported;
  try {
    imported = readProjectZip(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof ImportError) throw new HttpError(400, err.message);
    throw err;
  }
  const project = await createProject(user.id, name, imported.files, imported.mainFile);
  return NextResponse.json(
    {
      project: { id: project.id, name: project.name },
      mainFile: imported.mainFile,
      imported: imported.files.length,
      skipped: imported.skipped,
    },
    { status: 201 },
  );
});
