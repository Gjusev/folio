import { NextResponse } from "next/server";
import { z } from "zod";
import { LANGS } from "@/lib/i18n/dictionaries";
import { enforceRateLimit, fail, HttpError, parseJson, requireUser, route } from "@/lib/http";
import { buildResponseLetter } from "@/lib/letter";
import { validateFilePath } from "@/lib/paths";
import { createFile, getEditableProject, listFiles, saveFile } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const item = z.object({
  id: z.string().trim().min(1).max(40),
  reviewer: z.string().trim().min(1).max(80),
  severity: z.enum(["major", "minor", "nit"]).nullable().default(null),
  quote: z.string().max(400).nullable().default(null),
  comment: z.string().trim().min(1).max(4000),
  file: z.string().trim().max(200).nullable().default(null),
  line: z.number().int().min(1).nullable().default(null),
  response: z.string().max(4000).default(""),
  aiDraft: z.boolean().default(false),
});

const body = z.object({
  items: z.array(item).min(1).max(40),
  // Where the letter lands; re-running upserts so iterating does not litter.
  path: z.string().trim().max(200).default("response-letter.tex"),
  lang: z.enum(LANGS),
  snapshotLabel: z.string().trim().max(120).nullable().default(null),
});

// Renders the response letter as a standalone .tex (one subsection per
// comment, grouped by reviewer) and upserts it into the project.
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  const input = await parseJson(req, body);
  enforceRateLimit(`letter:${user.id}`, 20, 60_000);

  if (!input.path.endsWith(".tex")) throw fail(400, "api.letter.badPath");
  const pathError = validateFilePath(input.path);
  if (pathError) throw new HttpError(400, pathError);

  const content = buildResponseLetter(input.items, {
    lang: input.lang,
    snapshotLabel: input.snapshotLabel,
  });

  const existing = (await listFiles(project.id)).find((f) => f.path === input.path);
  if (existing) {
    const saved = await saveFile(project.id, existing.id, content, existing.version);
    return NextResponse.json({
      path: existing.path,
      fileId: existing.id,
      version: saved.version,
      content,
    });
  }
  const created = await createFile(project.id, { path: input.path, content });
  return NextResponse.json(
    { path: created.path, fileId: created.id, version: created.version, content },
    { status: 201 },
  );
});
