import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteComment, updateCommentBody } from "@/lib/comments";
import { parseJson, requireUser, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; cid: string }> };

const patchBody = z.object({ body: z.string().trim().min(1).max(4000) });

/** Edit a comment's text. Author only. */
export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, cid } = await params;
  const { body } = await parseJson(req, patchBody);
  const comment = await updateCommentBody(user.id, id, cid, body);
  return NextResponse.json({ comment });
});

/** Delete a thread root (replies cascade) or a reply. Author or project owner. */
export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, cid } = await params;
  await deleteComment(user.id, id, cid);
  return NextResponse.json({ ok: true });
});
