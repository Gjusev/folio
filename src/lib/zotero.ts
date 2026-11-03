import "server-only";
import { HttpError } from "@/lib/http";
import { addBibEntry } from "@/lib/bibtex";

// Zotero Web API v3 (https://www.zotero.org/support/dev/web_api/v3/basics):
// base https://api.zotero.org, Bearer auth, Zotero-API-Version: 3. Export
// formats (format=bibtex) require an explicit `limit` (max 100 per page).

const API = "https://api.zotero.org";

export type ZoteroCreds = { apiKey: string; userId: number };

export type ZoteroCollection = { key: string; name: string };

async function zoteroFetch(url: string, apiKey?: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "Zotero-API-Version": "3",
      },
    });
  } catch {
    throw new HttpError(502, "Zotero no responde");
  }
}

/** 403 = key rejected for the request; 404 = unknown key (live-checked). */
function badKey() {
  throw new HttpError(
    400,
    "La clave de Zotero no es válida o fue revocada; reintrodúcela en Ajustes",
  );
}

/**
 * Validates the key against the public /keys/<key> endpoint, which returns the
 * owning userID and the key's privileges — so the user only pastes the key.
 */
export async function verifyKey(apiKey: string): Promise<number> {
  const res = await zoteroFetch(`${API}/keys/${encodeURIComponent(apiKey)}`);
  if (res.status === 403 || res.status === 404) badKey();
  if (!res.ok) throw new HttpError(502, "Zotero no responde");
  const data = (await res.json().catch(() => null)) as {
    userID?: number;
    access?: { user?: { library?: boolean } };
  } | null;
  if (!data?.userID || !data.access?.user?.library) {
    throw new HttpError(400, "La clave no permite leer tu biblioteca de Zotero");
  }
  return data.userID;
}

/** First page only (50); the Link-header pagination is documented if ever needed. */
export async function fetchCollections(creds: ZoteroCreds): Promise<ZoteroCollection[]> {
  const res = await zoteroFetch(`${API}/users/${creds.userId}/collections?limit=50`, creds.apiKey);
  if (res.status === 403) badKey();
  if (!res.ok) throw new HttpError(502, "Zotero no responde");
  const rows = (await res.json().catch(() => null)) as { data?: { key: string; name: string } }[];
  return (rows ?? []).flatMap((c) => (c.data ? [{ key: c.data.key, name: c.data.name }] : []));
}

/** BibTeX of one collection, or of the whole library when `collection` is absent. */
export async function fetchBibtex(creds: ZoteroCreds, collection?: string): Promise<string> {
  const base = collection
    ? `${API}/users/${creds.userId}/collections/${encodeURIComponent(collection)}/items`
    : `${API}/users/${creds.userId}/items`;
  const res = await zoteroFetch(`${base}?format=bibtex&limit=100`, creds.apiKey);
  if (res.status === 403) badKey();
  if (res.status === 404) throw new HttpError(400, "Esa colección de Zotero no existe");
  if (!res.ok) throw new HttpError(502, "Zotero no responde");
  return res.text();
}

/* ---------------- merge into the project's .bib ---------------- */

const ENTRY_SPLIT = /(?=^\s*@)/m;

const fieldOf = (entry: string, name: string) =>
  new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*[{"](.+)[}"][ \\t]*,$`, "im").exec(entry)?.[1];

function entryDoi(entry: string): string | undefined {
  const raw = fieldOf(entry, "doi")
    ?.trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "");
  return raw && /^10\.\d{4,9}\/\S+$/.test(raw) ? raw : undefined;
}

/**
 * Merges Zotero's BibTeX dump entry by entry; addBibEntry dedups by DOI (else
 * title) and renames clashing keys. Titles keep their braces — addBibEntry
 * normalizes both sides before comparing.
 */
export function mergeBibtex(
  bib: string,
  incoming: string,
): { content: string; added: number; duplicates: number } {
  let content = bib;
  let added = 0;
  let duplicates = 0;
  for (const entry of incoming.split(ENTRY_SPLIT)) {
    if (!entry.trimStart().startsWith("@")) continue; // noise before the first entry
    const result = addBibEntry(content, entry, {
      doi: entryDoi(entry),
      title: fieldOf(entry, "title"),
    });
    if (result.added) {
      added++;
      content = result.content;
    } else {
      duplicates++;
    }
  }
  return { content, added, duplicates };
}
