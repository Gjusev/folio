import { NextResponse } from "next/server";
import { HttpError, enforceRateLimit, requireUser, route } from "@/lib/http";
import { MAX_BINARY_BYTES, isBinaryPath } from "@/lib/paths";
import { createFile, getEditableProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Uploads one file (a figure, or a .tex/.bib/.sty from disk) as multipart form
 * data: `file`, and an optional `folder` such as "figures".
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  enforceRateLimit(`upload:${user.id}`, 60, 60_000);
  // Browsers always send Content-Length for multipart; a missing or chunked
  // length would let formData() buffer an unbounded body. Fail closed.
  const length = Number(req.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0) {
    throw new HttpError(411, "Se requiere Content-Length");
  }
  if (length > MAX_BINARY_BYTES + 64_000) {
    throw new HttpError(413, "El archivo supera 10 MB");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Se esperaba un formulario con un archivo");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Falta el archivo");
  const folder = String(form.get("folder") ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const name = file.name.replace(/\s+/g, "-");
  const path = folder ? `${folder}/${name}` : name;
  const bytes = Buffer.from(await file.arrayBuffer());
  const created = await createFile(
    project.id,
    isBinaryPath(path) ? { path, data: bytes } : { path, content: bytes.toString("utf8") },
  );
  return NextResponse.json({ file: created }, { status: 201 });
});
