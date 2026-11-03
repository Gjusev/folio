import { HttpError, requireUser, route } from "@/lib/http";
import { MIME, extensionOf } from "@/lib/paths";
import { getFileData, getOwnedProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/** Serves a figure for preview. Only formats checked on upload are ever served. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id, fileId } = await params;
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, id);
  const file = await getFileData(project.id, fileId);
  const type = MIME[extensionOf(file.path)];
  if (!file.data || !type) throw new HttpError(404, "Archivo no encontrado");
  return new Response(new Blob([new Uint8Array(file.data)]), {
    headers: {
      "content-type": type,
      "cache-control": "private, no-store",
      // Defence in depth: nothing served here may run script.
      "content-security-policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
