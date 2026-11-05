import { strToU8, zipSync } from "fflate";
import { arxivProject } from "@/lib/compiler";
import { enforceRateLimit, fail, HttpError, requireUser, route } from "@/lib/http";
import { getViewableProject, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/** The first line of a TeX log that looks like an error (./main.tex:3: … or "! …"). */
function firstErrorLine(log: string): string | null {
  return (
    log
      .split("\n")
      .find((l) => /^! |:\d+: /.test(l))
      ?.trim() ??
    log.split("\n").find((l) => l.trim()) ??
    null
  );
}

/**
 * Builds and downloads the arXiv submission package: the compiler service
 * compiles the project and returns the closure of files arXiv needs (the
 * \input tree, figures, the .bib files and the generated .bbl — no build
 * artefacts), which is zipped here with the relative paths kept.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  // Compile-backed, so it shares the compile route's rate-limit bucket.
  enforceRateLimit(`compile:${user.id}`, 20, 60_000);
  const files = await listFilesWithData(project.id);
  const result = await arxivProject(
    project.mainFile,
    files.map((f) =>
      f.data
        ? { path: f.path, content: f.data.toString("base64"), encoding: "base64" as const }
        : { path: f.path, content: f.content },
    ),
  );
  // The log line is compiler data (raw LaTeX log); only the no-line fallback is ours.
  if (!result.ok || !result.package) {
    const line = firstErrorLine(result.log);
    throw line ? new HttpError(422, line) : fail(422, "api.export.compileFailed");
  }
  // The service validated every path, but the ZIP is opened on the user's
  // machine: never let a ".." segment ride along (zip-slip).
  if (result.package.files.some((f) => f.path.split("/").some((s) => !s || s.includes(".."))))
    throw fail(502, "api.export.badPaths");
  const zip = zipSync(
    Object.fromEntries(
      result.package.files.map((f) => [
        f.path,
        f.encoding === "base64"
          ? new Uint8Array(Buffer.from(f.content, "base64"))
          : strToU8(f.content),
      ]),
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
      "content-disposition": `attachment; filename="${slug}-arxiv.zip"`,
      "cache-control": "no-store",
    },
  });
});
