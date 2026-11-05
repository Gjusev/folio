import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/http";
import { setStates } from "@/lib/reviews-store";

type Ctx = { params: Promise<{ id: string; rid: string }> };

const body = z.object({
  // Replaces the whole map: keys are comment indexes (as strings).
  states: z.record(z.string(), z.enum(["dismissed", "resolved"])),
});

/** Persists what the author did with each comment (dismiss/resolve). Author only. */
export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, rid } = await params;
  const { states } = await parseJson(req, body);
  const saved = await setStates(user.id, id, rid, states);
  return NextResponse.json({ states: saved });
});
