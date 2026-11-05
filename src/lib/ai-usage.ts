import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Appends one AI-use event to the project's ledger (metadata only: action,
 * model, time — never content). Best effort: a ledger hiccup must never cost
 * the user the answer they just received, so callers may `.catch(() => {})`.
 */
export async function recordAiUsage(projectId: string, action: string, model: string) {
  await db()
    .insert(schema.aiUsage)
    .values({ projectId, action, model: model || "unknown" });
}

/** Every recorded AI-use event of a project, oldest first. */
export async function listAiUsage(projectId: string) {
  return db()
    .select({
      action: schema.aiUsage.action,
      model: schema.aiUsage.model,
      createdAt: schema.aiUsage.createdAt,
    })
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.projectId, projectId))
    .orderBy(asc(schema.aiUsage.createdAt));
}
