import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, enforceRateLimit, requireUser, route } from "@/lib/http";
import { listPapers, savePaper } from "@/lib/library";

/** parseJson has no size cap of its own; the raw text is checked before parsing
 *  (same as ai/image). ~25 MB of binary becomes ~34M base64 characters. */
const MAX_BODY_CHARS = 34_000_000;

const body = z.object({
  filename: z.string().trim().min(1).max(300),
  data: z.string().min(1),
});

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return NextResponse.json({ papers: await listPapers(user.id) });
});

/**
 * Uploads a PDF to the user's personal library: JSON {filename, data} with the
 * bytes as base64 (a data: URL prefix is tolerated). Size and %PDF- magic are
 * checked server-side; the client's pre-checks are only cosmetic.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  enforceRateLimit(`library:${user.id}`, 20, 60 * 60_000);
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) throw fail(413, "api.library.tooLarge");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw fail(400, "api.common.malformedJson");
  }
  const input = body.parse(parsed);
  // Tolerate a data URL prefix; the format comes from the bytes, never the client.
  const b64 = input.data.replace(/^data:[^,]*;base64,/, "");
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const paper = await savePaper(user.id, { filename: input.filename, bytes });
  return NextResponse.json({ paper }, { status: 201 });
});
