import { NextResponse } from "next/server";
import { z } from "zod";
import { createComment, listComments } from "@/lib/comments";
import { enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const anchor = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    quote: z.string().min(1).max(500),
  })
  .refine((a) => a.start <= a.end, { message: "start debe ser menor o igual que end" });

const createBody = z.object({
  fileId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
  parentId: z.uuid().optional(),
  anchor: anchor.optional(),
});

/** The comment threads of a project (all files). Anyone who can view. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const comments = await listComments(user.id, (await params).id);
  return NextResponse.json({ comments });
});

/** Post a comment (optionally anchored, optionally a reply). Viewers may
 *  comment: that is the point of a review round. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  enforceRateLimit(`comments:${user.id}`, 60, 10 * 60_000);
  const input = await parseJson(req, createBody);
  const comment = await createComment(user.id, (await params).id, input);
  return NextResponse.json({ comment }, { status: 201 });
});
