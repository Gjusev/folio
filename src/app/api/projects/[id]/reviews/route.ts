import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/http";
import { listReviews } from "@/lib/reviews-store";

type Ctx = { params: Promise<{ id: string }> };

/** History of saved review runs for this project, newest first (no result
 *  bodies; fetch one by id to see it). Owner, editors and viewers. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  const reviews = await listReviews(user.id, id);
  return NextResponse.json({ reviews });
});
