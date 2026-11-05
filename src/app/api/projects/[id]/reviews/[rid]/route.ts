import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/http";
import { deleteReview, getReview } from "@/lib/reviews-store";

type Ctx = { params: Promise<{ id: string; rid: string }> };

/** One saved review, result and comment states included. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, rid } = await params;
  const review = await getReview(user.id, id, rid);
  return NextResponse.json({ review });
});

/** Removes a saved review. Author only. */
export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, rid } = await params;
  await deleteReview(user.id, id, rid);
  return NextResponse.json({ ok: true });
});
