import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { seal, sealConfigured, unseal } from "@/lib/sealed";
import { fetchCollections, verifyKey, type ZoteroCreds } from "@/lib/zotero";

const KIND = "zotero";

async function storedCreds(userId: string): Promise<ZoteroCreds | null> {
  const [row] = await db()
    .select({ dataEnc: schema.integrations.dataEnc })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.userId, userId), eq(schema.integrations.kind, KIND)))
    .limit(1);
  if (!row) return null;
  try {
    return JSON.parse(unseal(row.dataEnc)) as ZoteroCreds;
  } catch {
    throw new HttpError(400, "No se pudo leer tu clave de Zotero; reintrodúcela en Ajustes");
  }
}

/** Connection status plus the first page of collections, for the picker. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const creds = await storedCreds(user.id);
  if (!creds) return NextResponse.json({ configured: false });
  const collections = await fetchCollections(creds);
  return NextResponse.json({ configured: true, collections });
});

// Zotero keys are 24 alphanumeric characters (lenient bounds, charset strict).
const putBody = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{8,64}$/, "La clave de Zotero solo contiene letras y números"),
});

/** Validates the key against Zotero (userID comes back from /keys/<key>) and seals it. */
export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const { apiKey } = await parseJson(req, putBody);
  enforceRateLimit(`zotero:save:${user.id}`, 10, 600_000);
  if (!sealConfigured())
    throw new HttpError(400, "Para guardar claves API define LLM_CREDENTIALS_KEY en el servidor");
  const userId = await verifyKey(apiKey);
  const dataEnc = seal(JSON.stringify({ apiKey, userId } satisfies ZoteroCreds));
  await db()
    .insert(schema.integrations)
    .values({ userId: user.id, kind: KIND, dataEnc })
    .onConflictDoUpdate({
      target: [schema.integrations.userId, schema.integrations.kind],
      set: { dataEnc },
    });
  return NextResponse.json({ configured: true });
});

export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  await db()
    .delete(schema.integrations)
    .where(and(eq(schema.integrations.userId, user.id), eq(schema.integrations.kind, KIND)));
  return new Response(null, { status: 204 });
});
