import { NextResponse } from "next/server";
import { setResolved } from "@/lib/comments";
import { requireUser, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; cid: string }> };

/** Mark a comment resolved (resolvedAt + resolvedBy). Editor access. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, cid } = await params;
  const comment = await setResolved(user.id, id, cid, true);
  return NextResponse.json({ comment });
});
