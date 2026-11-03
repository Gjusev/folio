import { strToU8, zipSync } from "fflate";
import { requireUser, route } from "@/lib/http";
import { getOwnedProject, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Downloads the project sources as a ZIP that compiles anywhere with latexmk. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  const files = await listFilesWithData(project.id);
  const zip = zipSync(
    Object.fromEntries(
      files.map((f) => [f.path, f.data ? new Uint8Array(f.data) : strToU8(f.content)]),
    ),
  );
  const slug =
    project.name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "") // drop accents split off by NFKD
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  return new Response(new Blob([zip as Uint8Array<ArrayBuffer>]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${slug}.zip"`,
      "cache-control": "no-store",
    },
  });
});
