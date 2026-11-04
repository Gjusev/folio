import { NextResponse } from "next/server";
import { setResolved } from "@/lib/comments";
import { requireUser, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; cid: string }> };

/** Clear resolvedAt/resolvedBy. Editor access, same as resolve. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, cid } = await params;
  const comment = await setResolved(user.id, id, cid, false);
  return NextResponse.json({ comment });
});
