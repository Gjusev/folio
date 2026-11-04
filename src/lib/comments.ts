import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import {
  getAccessibleProject,
  getEditableProject,
  getFile,
  getViewableProject,
} from "@/lib/projects";

/** What the drawer and markers consume; dates as ISO strings. */
export type CommentDto = {
  id: string;
  fileId: string;
  filePath: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  anchorStart: number | null;
  anchorEnd: number | null;
  anchorQuote: string | null;
  body: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
};

export type NewComment = {
  fileId: string;
  body: string;
  parentId?: string;
  anchor?: { start: number; end: number; quote: string };
};

const commentColumns = {
  id: schema.comments.id,
  fileId: schema.comments.fileId,
  filePath: schema.files.path,
  authorId: schema.comments.authorId,
  authorName: schema.users.name,
  parentId: schema.comments.parentId,
  anchorStart: schema.comments.anchorStart,
  anchorEnd: schema.comments.anchorEnd,
  anchorQuote: schema.comments.anchorQuote,
  body: schema.comments.body,
  resolvedAt: schema.comments.resolvedAt,
  resolvedBy: schema.comments.resolvedBy,
  createdAt: schema.comments.createdAt,
};

type CommentRow = {
  id: string;
  fileId: string;
  filePath: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  anchorStart: number | null;
  anchorEnd: number | null;
  anchorQuote: string | null;
  body: string;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
};

function toDto(r: CommentRow): CommentDto {
  return {
    ...r,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function selectComment(id: string) {
  return db()
    .select(commentColumns)
    .from(schema.comments)
    .innerJoin(schema.files, eq(schema.files.id, schema.comments.fileId))
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(eq(schema.comments.id, id))
    .limit(1);
}

/** All comments of a project (every file), oldest thread first. Viewers see them. */
export async function listComments(userId: string, projectId: string) {
  const project = await getViewableProject(userId, projectId);
  const rows = await db()
    .select(commentColumns)
    .from(schema.comments)
    .innerJoin(schema.files, eq(schema.files.id, schema.comments.fileId))
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(eq(schema.comments.projectId, project.id))
    .orderBy(asc(schema.comments.createdAt), asc(schema.comments.id));
  return rows.map(toDto);
}

export async function createComment(
  userId: string,
  projectId: string,
  input: NewComment,
): Promise<CommentDto> {
  const project = await getViewableProject(userId, projectId);
  const file = await getFile(project.id, input.fileId);
  if (input.anchor) {
    const { start, end } = input.anchor;
    if (start < 0 || start > end || end > file.content.length) {
      throw new HttpError(400, "El ancla queda fuera del archivo");
    }
  }
  if (input.parentId) {
    const parent = await findComment(project.id, input.parentId);
    if (parent.parentId) throw new HttpError(400, "No se puede responder a una respuesta");
  }
  const [created] = await db()
    .insert(schema.comments)
    .values({
      projectId: project.id,
      fileId: file.id,
      authorId: userId,
      parentId: input.parentId ?? null,
      anchorStart: input.anchor?.start ?? null,
      anchorEnd: input.anchor?.end ?? null,
      anchorQuote: input.anchor?.quote ?? null,
      body: input.body,
    })
    .returning({ id: schema.comments.id });
  const [row] = await selectComment(created.id);
  return toDto(row);
}

/** Author-only edit; other members of the project get a 403. */
export async function updateCommentBody(
  userId: string,
  projectId: string,
  commentId: string,
  body: string,
): Promise<CommentDto> {
  const project = await getViewableProject(userId, projectId);
  const comment = await findComment(project.id, commentId);
  if (comment.authorId !== userId)
    throw new HttpError(403, "Solo el autor puede editar el comentario");
  await db().update(schema.comments).set({ body }).where(eq(schema.comments.id, comment.id));
  const [row] = await selectComment(comment.id);
  return toDto(row);
}

/** Resolve/reopen. Editors and the owner; viewers get the usual 403. */
export async function setResolved(
  userId: string,
  projectId: string,
  commentId: string,
  resolved: boolean,
): Promise<CommentDto> {
  const project = await getEditableProject(userId, projectId);
  const comment = await findComment(project.id, commentId);
  await db()
    .update(schema.comments)
    .set(
      resolved
        ? { resolvedAt: new Date(), resolvedBy: userId }
        : { resolvedAt: null, resolvedBy: null },
    )
    .where(eq(schema.comments.id, comment.id));
  const [row] = await selectComment(comment.id);
  return toDto(row);
}

/** Author or project owner. Replies fall with their root via the FK cascade. */
export async function deleteComment(userId: string, projectId: string, commentId: string) {
  const { project } = await getAccessibleProject(userId, projectId);
  const comment = await findComment(project.id, commentId);
  if (comment.authorId !== userId && project.ownerId !== userId)
    throw new HttpError(403, "Solo el autor o el dueño del proyecto pueden borrar el comentario");
  await db().delete(schema.comments).where(eq(schema.comments.id, comment.id));
}

/** Comment of this project or a uniform 404 (no probing other projects). */
async function findComment(projectId: string, commentId: string) {
  if (!isUuid(commentId)) throw new HttpError(404, "Comentario no encontrado");
  const [comment] = await db()
    .select()
    .from(schema.comments)
    .where(and(eq(schema.comments.id, commentId), eq(schema.comments.projectId, projectId)))
    .limit(1);
  if (!comment) throw new HttpError(404, "Comentario no encontrado");
  return comment;
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
