import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import {
  MAX_BINARY_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_PROJECT,
  MAX_PROJECT_BYTES,
  isBinaryPath,
  extensionOf,
  matchesMagic,
  validateFilePath,
} from "@/lib/paths";

// Every query is scoped by owner. A project the user does not own is reported
// as "not found" so ids cannot be probed.

export type NewFile = { path: string; content?: string; data?: Buffer };

/** Columns for listings: everything except binary data. */
const fileMeta = {
  id: schema.files.id,
  projectId: schema.files.projectId,
  path: schema.files.path,
  content: schema.files.content,
  version: schema.files.version,
  size: schema.files.size,
  binary: sql<boolean>`${schema.files.data} is not null`,
  updatedAt: schema.files.updatedAt,
};

export type FileMeta = {
  id: string;
  projectId: string;
  path: string;
  content: string;
  version: number;
  size: number;
  binary: boolean;
  updatedAt: Date;
};

export async function listProjects(userId: string) {
  return db()
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      updatedAt: schema.projects.updatedAt,
      files: sql<number>`(select count(*)::int from "files" where "files"."project_id" = "projects"."id")`,
    })
    .from(schema.projects)
    .where(eq(schema.projects.ownerId, userId))
    .orderBy(desc(schema.projects.updatedAt));
}

/** Checks a set of files before they are written: paths, sizes, formats. */
export function checkFiles(files: NewFile[]) {
  if (files.length === 0) throw new HttpError(400, "El proyecto no tiene archivos");
  if (files.length > MAX_FILES_PER_PROJECT) {
    throw new HttpError(400, `Máximo ${MAX_FILES_PER_PROJECT} archivos por proyecto`);
  }
  let total = 0;
  for (const f of files) {
    const problem = validateFilePath(f.path);
    if (problem) throw new HttpError(400, `${f.path}: ${problem}`);
    if (isBinaryPath(f.path)) {
      if (!f.data) throw new HttpError(400, `${f.path}: falta el contenido`);
      if (f.data.length > MAX_BINARY_BYTES) throw new HttpError(413, `${f.path} supera 10 MB`);
      if (!matchesMagic(f.path, f.data)) {
        throw new HttpError(400, `${f.path} no es un archivo de ese formato`);
      }
      total += f.data.length;
    } else {
      const size = Buffer.byteLength(f.content ?? "");
      if (size > MAX_FILE_BYTES) throw new HttpError(413, f.path + " supera 1 MB");
      total += size;
    }
  }
  if (total > MAX_PROJECT_BYTES) throw new HttpError(413, "El proyecto supera 50 MB");
}

function row(projectId: string, f: NewFile) {
  return isBinaryPath(f.path)
    ? { projectId, path: f.path, content: "", data: f.data!, size: f.data!.length }
    : {
        projectId,
        path: f.path,
        content: f.content ?? "",
        size: Buffer.byteLength(f.content ?? ""),
      };
}

export async function createProject(
  userId: string,
  name: string,
  files: NewFile[],
  mainFile = "main.tex",
) {
  checkFiles(files);
  if (!files.some((f) => f.path === mainFile))
    throw new HttpError(400, "Falta el archivo principal");
  return db().transaction(async (tx) => {
    const [project] = await tx
      .insert(schema.projects)
      .values({ ownerId: userId, name, mainFile })
      .returning();
    await tx.insert(schema.files).values(files.map((f) => row(project.id, f)));
    return project;
  });
}

export async function getOwnedProject(userId: string, projectId: string) {
  if (!isUuid(projectId)) throw new HttpError(404, "Proyecto no encontrado");
  const [project] = await db()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.ownerId, userId)))
    .limit(1);
  if (!project) throw new HttpError(404, "Proyecto no encontrado");
  return project;
}

export async function renameProject(projectId: string, name: string) {
  await db()
    .update(schema.projects)
    .set({ name, updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
}

export async function setMainFile(projectId: string, path: string) {
  if (!path.endsWith(".tex")) throw new HttpError(400, "El archivo principal debe ser .tex");
  const [file] = await db()
    .select({ id: schema.files.id })
    .from(schema.files)
    .where(and(eq(schema.files.projectId, projectId), eq(schema.files.path, path)));
  if (!file) throw new HttpError(404, "Archivo no encontrado");
  await db()
    .update(schema.projects)
    .set({ mainFile: path })
    .where(eq(schema.projects.id, projectId));
}

/** Persists the drafting-agent steering (instructions + style sample). */
export async function setAiSteering(
  projectId: string,
  steering: { aiInstructions?: string | null; aiStyleSample?: string | null },
) {
  await db().update(schema.projects).set(steering).where(eq(schema.projects.id, projectId));
}

/** Persists the agent's section plan (editable outline for section drafting). */
export async function setAiPlan(projectId: string, plan: unknown) {
  await db().update(schema.projects).set({ aiPlan: plan }).where(eq(schema.projects.id, projectId));
}

/* ---------------- snapshots ---------------- */

export type SnapshotMeta = {
  id: string;
  label: string;
  createdAt: Date;
  files: number;
};

export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const rows = await db()
    .select({
      id: schema.snapshots.id,
      label: schema.snapshots.label,
      createdAt: schema.snapshots.createdAt,
      files: schema.snapshots.files,
    })
    .from(schema.snapshots)
    .where(eq(schema.snapshots.projectId, projectId))
    .orderBy(desc(schema.snapshots.createdAt))
    .limit(30);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.createdAt,
    files: Object.keys(r.files as Record<string, string>).length,
  }));
}

/** Saves the project's text files as one snapshot (binaries excluded). */
export async function createSnapshot(projectId: string, label: string) {
  const files = await listFiles(projectId);
  const map: Record<string, string> = {};
  for (const f of files) if (!f.binary) map[f.path] = f.content;
  const [row] = await db()
    .insert(schema.snapshots)
    .values({ projectId, label, files: map })
    .returning({ id: schema.snapshots.id, createdAt: schema.snapshots.createdAt });
  return { id: row.id, createdAt: row.createdAt, label, files: Object.keys(map).length };
}

export async function getSnapshotFiles(
  projectId: string,
  snapshotId: string,
): Promise<Record<string, string>> {
  if (!isUuid(snapshotId)) throw new HttpError(404, "Snapshot no encontrado");
  const [row] = await db()
    .select({ files: schema.snapshots.files })
    .from(schema.snapshots)
    .where(and(eq(schema.snapshots.id, snapshotId), eq(schema.snapshots.projectId, projectId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Snapshot no encontrado");
  return row.files as Record<string, string>;
}

export async function deleteSnapshot(projectId: string, snapshotId: string) {
  if (!isUuid(snapshotId)) return;
  await db()
    .delete(schema.snapshots)
    .where(and(eq(schema.snapshots.id, snapshotId), eq(schema.snapshots.projectId, projectId)));
}

export async function deleteProject(projectId: string) {
  await db().delete(schema.projects).where(eq(schema.projects.id, projectId));
}

export async function listFiles(projectId: string): Promise<FileMeta[]> {
  return db()
    .select(fileMeta)
    .from(schema.files)
    .where(eq(schema.files.projectId, projectId))
    .orderBy(asc(schema.files.path));
}

/** Text and binary contents, for compiling and exporting. */
export async function listFilesWithData(projectId: string) {
  return db()
    .select({ path: schema.files.path, content: schema.files.content, data: schema.files.data })
    .from(schema.files)
    .where(eq(schema.files.projectId, projectId))
    .orderBy(asc(schema.files.path));
}

export async function createFile(projectId: string, file: NewFile): Promise<FileMeta> {
  checkFiles([file]);
  const values = row(projectId, file);
  // The advisory lock serializes concurrent uploads to one project, so the
  // count/byte caps cannot be raced past their limits.
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${projectId}))`);
    const [usage] = await tx
      .select({
        n: count(),
        bytes: sql<number>`coalesce(sum(${schema.files.size}), 0)::int`,
      })
      .from(schema.files)
      .where(eq(schema.files.projectId, projectId));
    if (usage.n >= MAX_FILES_PER_PROJECT) {
      throw new HttpError(400, `Máximo ${MAX_FILES_PER_PROJECT} archivos por proyecto`);
    }
    if (usage.bytes + values.size > MAX_PROJECT_BYTES) {
      throw new HttpError(413, "El proyecto supera 50 MB");
    }
    const [created] = await tx
      .insert(schema.files)
      .values(values)
      .onConflictDoNothing()
      .returning(fileMeta);
    if (!created) throw new HttpError(409, "Ya existe un archivo con esa ruta");
    await tx
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
    return created;
  });
}

export async function getFile(projectId: string, fileId: string): Promise<FileMeta> {
  if (!isUuid(fileId)) throw new HttpError(404, "Archivo no encontrado");
  const [file] = await db()
    .select(fileMeta)
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), eq(schema.files.projectId, projectId)))
    .limit(1);
  if (!file) throw new HttpError(404, "Archivo no encontrado");
  return file;
}

export async function getFileData(projectId: string, fileId: string) {
  const meta = await getFile(projectId, fileId);
  const [{ data }] = await db()
    .select({ data: schema.files.data })
    .from(schema.files)
    .where(eq(schema.files.id, meta.id));
  return { ...meta, data };
}

/** Saves only if nobody saved in between; otherwise 409 with the current server copy. */
export async function saveFile(
  projectId: string,
  fileId: string,
  content: string,
  baseVersion: number,
) {
  const current = await getFile(projectId, fileId);
  if (current.binary) throw new HttpError(400, "Los archivos binarios no se editan como texto");
  const nextBytes = Buffer.byteLength(content);
  const [saved] = await db().transaction(async (tx) => {
    // Keep the 50 MB project cap on the save path too, not just on creation.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${projectId}))`);
    const [{ bytes }] = await tx
      .select({ bytes: sql<number>`coalesce(sum(${schema.files.size}), 0)::int` })
      .from(schema.files)
      .where(eq(schema.files.projectId, projectId));
    if (bytes - current.size + nextBytes > MAX_PROJECT_BYTES) {
      throw new HttpError(413, "El proyecto supera 50 MB");
    }
    return tx
      .update(schema.files)
      .set({
        content,
        size: nextBytes,
        version: baseVersion + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.files.id, current.id), eq(schema.files.version, baseVersion)))
      .returning({ version: schema.files.version, updatedAt: schema.files.updatedAt });
  });
  if (!saved) {
    const latest = await getFile(projectId, fileId);
    throw new HttpError(409, "El archivo se modificó en otra sesión", {
      current: { content: latest.content, version: latest.version },
    });
  }
  await touchProject(projectId);
  return saved;
}

export async function renameFile(
  projectId: string,
  mainFile: string,
  fileId: string,
  path: string,
) {
  const pathError = validateFilePath(path);
  if (pathError) throw new HttpError(400, pathError);
  const file = await getFile(projectId, fileId);
  if (isBinaryPath(path) !== file.binary) {
    throw new HttpError(400, "No se puede cambiar un archivo de texto a binario o al revés");
  }
  const [clash] = await db()
    .select({ id: schema.files.id })
    .from(schema.files)
    .where(and(eq(schema.files.projectId, projectId), eq(schema.files.path, path)));
  if (clash && clash.id !== file.id) throw new HttpError(409, "Ya existe un archivo con esa ruta");
  if (file.binary && extensionOf(file.path) !== extensionOf(path)) {
    // Renaming between binary formats must keep the bytes-format invariant.
    const [{ data }] = await db()
      .select({ data: schema.files.data })
      .from(schema.files)
      .where(eq(schema.files.id, file.id));
    if (data && !matchesMagic(path, new Uint8Array(data))) {
      throw new HttpError(400, `${path}: el contenido no coincide con ese formato`);
    }
  }
  await db().transaction(async (tx) => {
    await tx
      .update(schema.files)
      .set({ path, updatedAt: new Date() })
      .where(eq(schema.files.id, file.id));
    if (mainFile === file.path) {
      await tx
        .update(schema.projects)
        .set({ mainFile: path })
        .where(eq(schema.projects.id, projectId));
    }
  });
}

export async function deleteFile(projectId: string, mainFile: string, fileId: string) {
  const file = await getFile(projectId, fileId);
  if (file.path === mainFile) throw new HttpError(400, "No se puede borrar el archivo principal");
  await db().delete(schema.files).where(eq(schema.files.id, file.id));
  await touchProject(projectId);
}

async function touchProject(projectId: string) {
  await db()
    .update(schema.projects)
    .set({ updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
