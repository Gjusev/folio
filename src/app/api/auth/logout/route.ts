import { NextResponse } from "next/server";
import { SESSION_COOKIE, deleteSession } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const POST = route(async (req) => {
  await deleteSession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
