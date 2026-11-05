import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { getViewableProject } from "@/lib/projects";
import type { Review } from "@/lib/review";

/** What the author did with a comment of a saved review. */
export type CommentState = "dismissed" | "resolved";
/** Comment index (as string, JSON keys) -> what the author did. */
export type ReviewStates = Record<string, CommentState>;

export type SavedReviewMeta = {
  id: string;
  userId: string;
  userName: string;
  lang: string;
  aspects: string[];
  rigor: string;
  focus: string;
  createdAt: string;
};

export type SavedReview = SavedReviewMeta & { result: Review; states: ReviewStates };

/** How many saved reviews the history list shows. */
export const REVIEW_HISTORY_LIMIT = 30;

const metaColumns = {
  id: schema.reviews.id,
  userId: schema.reviews.userId,
  userName: schema.users.name,
  lang: schema.reviews.lang,
  aspects: schema.reviews.aspects,
  rigor: schema.reviews.rigor,
  focus: schema.reviews.focus,
  createdAt: schema.reviews.createdAt,
};

/** Persists one review run; returns the row id for the history list. */
export async function saveReview(input: {
  projectId: string;
  userId: string;
  lang: string;
  aspects: string[];
  rigor: string;
  focus: string;
  result: Review;
}): Promise<string> {
  const [row] = await db()
    .insert(schema.reviews)
    .values({
      projectId: input.projectId,
      userId: input.userId,
      lang: input.lang,
      aspects: input.aspects,
      rigor: input.rigor,
      focus: input.focus,
      result: input.result,
    })
    .returning({ id: schema.reviews.id });
  return row.id;
}

/** History list, newest first. No result bodies: the full review is fetched
 *  per id when the author clicks one. */
export async function listReviews(
  userId: string,
  projectId: string,
  limit = REVIEW_HISTORY_LIMIT,
): Promise<SavedReviewMeta[]> {
  const project = await getViewableProject(userId, projectId);
  const rows = await db()
    .select(metaColumns)
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
    .where(eq(schema.reviews.projectId, project.id))
    .orderBy(desc(schema.reviews.createdAt), desc(schema.reviews.id))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    aspects: r.aspects as string[],
    createdAt: r.createdAt.toISOString(),
  }));
}

/** One saved review with its result and comment states. */
export async function getReview(userId: string, projectId: string, reviewId: string) {
  const project = await getViewableProject(userId, projectId);
  const row = await findReview(project.id, reviewId);
  return toDto(row);
}

/** Replaces the comment states wholesale. Keys must index that review's
 *  comments, so stale indexes from an older render are rejected loudly. */
export async function setStates(
  userId: string,
  projectId: string,
  reviewId: string,
  states: ReviewStates,
) {
  const project = await getViewableProject(userId, projectId);
  const row = await findReview(project.id, reviewId);
  if (row.userId !== userId)
    throw new HttpError(403, "Solo el autor puede cambiar el estado de los comentarios");
  const n = (row.result as Review).comments.length;
  for (const key of Object.keys(states)) {
    if (!/^\d+$/.test(key) || Number(key) >= n)
      throw new HttpError(400, `No hay ningún comentario número ${key} en esa revisión`);
  }
  await db().update(schema.reviews).set({ states }).where(eq(schema.reviews.id, row.id));
  return states;
}

/** Author only (the project owner included). */
export async function deleteReview(userId: string, projectId: string, reviewId: string) {
  const project = await getViewableProject(userId, projectId);
  const row = await findReview(project.id, reviewId);
  if (row.userId !== userId) throw new HttpError(403, "Solo el autor puede borrar la revisión");
  await db().delete(schema.reviews).where(eq(schema.reviews.id, row.id));
}

/** Saved review of this project or a uniform 404 (no probing other projects). */
async function findReview(projectId: string, reviewId: string): Promise<ReviewRow> {
  if (!isUuid(reviewId)) throw new HttpError(404, "Revisión no encontrada");
  const [row] = await db()
    .select({ review: schema.reviews, userName: schema.users.name })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
    .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.projectId, projectId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Revisión no encontrada");
  return { ...row.review, userName: row.userName };
}

type ReviewRow = {
  id: string;
  userId: string;
  userName: string;
  lang: string;
  aspects: unknown;
  rigor: string;
  focus: string;
  result: unknown;
  states: unknown;
  createdAt: Date;
};

function toDto(r: ReviewRow): SavedReview {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    lang: r.lang,
    aspects: r.aspects as string[],
    rigor: r.rigor,
    focus: r.focus,
    result: r.result as Review,
    states: (r.states ?? {}) as ReviewStates,
    createdAt: r.createdAt.toISOString(),
  };
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
