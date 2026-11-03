import { NextResponse } from "next/server";
import { signCollabToken } from "@/lib/collab-token";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { getViewableProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Hands out a 1-hour relay token for live collaboration. Readers (viewers)
 * get one too: watching edits happen live is read-only. 404 {enabled:false}
 * when COLLAB_URL is unset — the client treats that as "feature off" and
 * never opens a socket, so behaviour is identical to today.
 *
 * The token proves "this user may open rooms for this project"; which room a
 * client joins is a fileId in the URL (v1: the relay cannot check file↔project,
 * it has no database — see the report).
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  enforceRateLimit(`collab-token:${user.id}`, 30, 60_000);

  const url = process.env.COLLAB_URL ?? "";
  // Falls back to COMPILER_TOKEN so a single-secret deployment works
  // (documented in .env.example).
  const secret = process.env.COLLAB_SECRET || process.env.COMPILER_TOKEN || "";
  if (!url || secret.length < 16) return NextResponse.json({ enabled: false }, { status: 404 });

  return NextResponse.json({ url, token: signCollabToken(project.id, user.id, secret) });
});
