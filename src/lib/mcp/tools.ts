import "server-only";
import { z, type ZodType } from "zod";
import { enforceRateLimit, HttpError } from "@/lib/http";
import { addBibEntry, toBibtex } from "@/lib/bibtex";
import { compileProject } from "@/lib/compiler";
import { parseLatexLog } from "@/lib/latex-log";
import { getPaper, searchPapers, type Source } from "@/lib/papers";
import {
  createFile,
  createSnapshot,
  getAccessibleProject,
  getEditableProject,
  listFiles,
  listFilesWithData,
  listProjects,
  listSnapshots,
  saveFile,
} from "@/lib/projects";
import type { ApiIdentity, TokenScope } from "@/lib/api-tokens";

/**
 * The MCP tool registry: the things an agent can do to a Folio project.
 * Descriptions are one precise sentence in English — agents read them to pick
 * a tool. Scope checks and project-role checks (viewer vs editor) happen in
 * server.ts / the projects service before any handler work runs.
 */

export type McpTool = {
  name: string;
  description: string;
  /** All listed scopes are required (add_reference needs literature AND write). */
  scopes: readonly TokenScope[];
  input: ZodType<Record<string, unknown>>;
  run: (identity: ApiIdentity, params: Record<string, unknown>) => Promise<unknown>;
};

const projectId = z.object({ projectId: z.uuid() });

const TOOLS: McpTool[] = [
  {
    name: "list_projects",
    description: "Lists the projects you own or collaborate on, with your role in each.",
    scopes: ["read"],
    input: z.object({}).strict(),
    run: async (identity) =>
      (await listProjects(identity.user.id)).map((p) => ({
        id: p.id,
        name: p.name,
        mainFile: p.mainFile,
        role: p.role ?? "owner",
        updatedAt: p.updatedAt,
      })),
  },
  {
    name: "get_project",
    description: "Shows one project's metadata and its files (path, size, version, binary flag).",
    scopes: ["read"],
    input: projectId,
    run: async (identity, params) => {
      const { project, role } = await getAccessibleProject(
        identity.user.id,
        params.projectId as string,
      );
      const files = await listFiles(project.id);
      return {
        name: project.name,
        mainFile: project.mainFile,
        role,
        files: files.map((f) => ({
          id: f.id,
          path: f.path,
          binary: f.binary,
          size: f.size,
          version: f.version,
        })),
      };
    },
  },
  {
    name: "read_file",
    description: "Returns the content and current version of one text file, looked up by path.",
    scopes: ["read"],
    input: z.object({ projectId: z.uuid(), path: z.string().trim().min(1).max(200) }),
    run: async (identity, params) => {
      const { project } = await getAccessibleProject(identity.user.id, params.projectId as string);
      const file = (await listFiles(project.id)).find((f) => f.path === params.path);
      if (!file) throw new HttpError(404, `No file at ${params.path}`);
      if (file.binary)
        throw new HttpError(400, `${params.path} is a binary file; only text can be read`);
      return { path: file.path, content: file.content, version: file.version };
    },
  },
  {
    name: "write_file",
    description:
      "Creates a file, or overwrites an existing one using the baseVersion from read_file (optimistic concurrency).",
    scopes: ["write"],
    input: z.object({
      projectId: z.uuid(),
      path: z.string().trim().min(1).max(200),
      content: z.string().max(1_000_000),
      baseVersion: z.number().int().min(1).optional(),
    }),
    run: async (identity, params) => {
      const project = await getEditableProject(identity.user.id, params.projectId as string);
      const path = params.path as string;
      const existing = (await listFiles(project.id)).find((f) => f.path === path);
      if (existing) {
        if (existing.binary)
          throw new HttpError(400, `${path} is a binary file and cannot be written as text`);
        if (params.baseVersion === undefined) {
          throw new HttpError(
            409,
            `${path} already exists at version ${existing.version}: call read_file to get its content and version, then retry with baseVersion`,
          );
        }
        if (params.baseVersion !== existing.version) {
          throw new HttpError(
            409,
            `Conflict on ${path}: the current version is ${existing.version} but you sent baseVersion ${params.baseVersion}; read_file again and retry with the fresh version`,
          );
        }
        const saved = await saveFile(
          project.id,
          existing.id,
          params.content as string,
          existing.version,
        );
        return { path, version: saved.version };
      }
      // New file: createFile validates the path exactly like an upload.
      const created = await createFile(project.id, {
        path,
        content: params.content as string,
      });
      return { path: created.path, version: created.version, created: true };
    },
  },
  {
    name: "compile",
    description:
      "Compiles the project's main file and returns errors and warning count from the log (never the PDF).",
    scopes: ["compile"],
    input: projectId,
    run: async (identity, params) => {
      const { project } = await getAccessibleProject(identity.user.id, params.projectId as string);
      // Same bucket as the in-app compile button: agents share the user's quota.
      enforceRateLimit(`compile:${identity.user.id}`, 20, 60_000);
      const files = await listFilesWithData(project.id);
      const started = Date.now();
      const result = await compileProject(
        project.mainFile,
        files.map((f) =>
          f.data
            ? { path: f.path, content: f.data.toString("base64"), encoding: "base64" as const }
            : { path: f.path, content: f.content },
        ),
      );
      const { errors, warnings } = parseLatexLog(result.log);
      return {
        ok: result.ok,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        errors: errors.map((e) => ({ file: e.file, line: e.line, message: e.message })),
        warningCount: warnings.length,
      };
    },
  },
  {
    name: "search_literature",
    description:
      "Searches OpenAlex for papers matching a query and returns title, authors, year, venue, DOI and citations.",
    scopes: ["literature"],
    input: z.object({
      query: z.string().trim().min(2).max(300),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    run: async (identity, params) => {
      enforceRateLimit(`papers:${identity.user.id}`, 30, 60_000);
      const page = await searchPapers("openalex", {
        q: params.query as string,
        sort: "relevance",
        openAccess: false,
        page: 1,
      });
      return page.results.slice(0, params.limit as number).map((p) => ({
        title: p.title,
        authors: p.authors,
        year: p.year,
        venue: p.venue,
        doi: p.doi,
        citedBy: p.citedBy,
        paperId: p.id,
      }));
    },
  },
  {
    name: "add_reference",
    description:
      "Appends a paper's BibTeX entry to the project's first .bib file and returns its citation key.",
    scopes: ["literature", "write"],
    input: z.object({
      projectId: z.uuid(),
      source: z.enum(["openalex", "s2", "arxiv"]),
      paperId: z.string().trim().min(1).max(200),
    }),
    run: async (identity, params) => {
      const project = await getEditableProject(identity.user.id, params.projectId as string);
      const paper = await getPaper(params.source as Source, params.paperId as string);
      const bib = (await listFiles(project.id)).find((f) => f.path.endsWith(".bib"));
      if (!bib) {
        throw new HttpError(
          400,
          `This project has no .bib file: create one first with write_file {projectId, path: "refs.bib", content: ""}, then call add_reference again`,
        );
      }
      const { entry } = toBibtex(paper);
      const result = addBibEntry(bib.content, entry, { doi: paper.doi, title: paper.title });
      if (result.added) await saveFile(project.id, bib.id, result.content, bib.version);
      return { key: result.key, added: result.added, bibPath: bib.path };
    },
  },
  {
    name: "create_snapshot",
    description:
      "Saves the project's current text files as a named snapshot so you can checkpoint before big edits.",
    scopes: ["write"],
    input: z.object({ projectId: z.uuid(), label: z.string().trim().max(120).optional() }),
    run: async (identity, params) => {
      const project = await getEditableProject(identity.user.id, params.projectId as string);
      const label = (params.label as string | undefined) ?? new Date().toISOString();
      const { id, createdAt } = await createSnapshot(project.id, label);
      return { id, label, createdAt };
    },
  },
  {
    name: "list_snapshots",
    description:
      "Lists the project's saved snapshots (newest first) with id, label and creation time.",
    scopes: ["read"],
    input: projectId,
    run: async (identity, params) => {
      const { project } = await getAccessibleProject(identity.user.id, params.projectId as string);
      return (await listSnapshots(project.id)).map((s) => ({
        id: s.id,
        label: s.label,
        createdAt: s.createdAt,
      }));
    },
  },
];

export function findTool(name: string): McpTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** The `tools/list` result: JSON Schema for each tool's arguments. */
export function toolDescriptors() {
  return {
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.input),
    })),
  };
}
