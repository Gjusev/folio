import "server-only";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import type { Endpoint } from "@/lib/llm-profiles";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function llmConfigured(): boolean {
  const { LLM_BASE_URL, LLM_MODEL } = env();
  return Boolean(LLM_BASE_URL && LLM_MODEL);
}

/** The .env endpoint, as an Endpoint (back-compat for callers without profiles). */
export function envEndpoint(): Endpoint | null {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = env();
  if (!LLM_BASE_URL || !LLM_MODEL) return null;
  return {
    id: "env",
    label: LLM_MODEL,
    kind: "openai",
    baseUrl: LLM_BASE_URL,
    apiKey: LLM_API_KEY,
    model: LLM_MODEL,
    extra: {},
  };
}

/* ---------- request builders (pure, tested) ---------- */

/** OpenAI-compatible body. Temperature omitted for Anthropic (4.7+ rejects <1). */
export function openAiBody(
  e: Endpoint,
  messages: ChatMessage[],
): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: `${e.baseUrl}/chat/completions`,
    headers: {
      "content-type": "application/json",
      ...(e.apiKey ? { authorization: `Bearer ${e.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: e.model,
      messages,
      stream: true,
      temperature: 0.3,
      ...(Object.keys(e.extra).length ? e.extra : {}),
    }),
  };
}

/** Anthropic Messages API: system hoisted, max_tokens required, no temperature. */
export function anthropicBody(
  e: Endpoint,
  messages: ChatMessage[],
): { url: string; headers: Record<string, string>; body: string } {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    // Messages must alternate; merge consecutive same-role turns.
    .reduce<ChatMessage[]>((acc, m) => {
      const prev = acc[acc.length - 1];
      if (prev && prev.role === m.role) prev.content += `\n\n${m.content}`;
      else acc.push({ ...m });
      return acc;
    }, [])
    .filter((m) => m.content.trim());
  if (rest.length === 0) rest.push({ role: "user", content: "(vacío)" });
  if (rest[0].role === "assistant") rest.shift();
  return {
    url: `${e.baseUrl}/v1/messages`,
    headers: {
      "content-type": "application/json",
      "x-api-key": e.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: e.model,
      max_tokens: 8192,
      ...(system ? { system } : {}),
      messages: rest,
      stream: true,
    }),
  };
}

/** Pulls the text delta out of one SSE payload, whatever the wire format. */
export function deltaText(kind: Endpoint["kind"], data: string): string | null {
  if (kind === "anthropic") {
    let ev: { type?: string; delta?: { text?: string }; error?: { message?: string } };
    try {
      ev = JSON.parse(data);
    } catch {
      return null;
    }
    if (ev.error)
      throw new HttpError(502, `Error del proveedor de IA: ${ev.error.message ?? "desconocido"}`);
    if (ev.type === "content_block_delta" && ev.delta?.text) return ev.delta.text;
    return null;
  }
  let json: { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string } };
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  if (json.error)
    throw new HttpError(502, `Error del proveedor de IA: ${json.error.message ?? "desconocido"}`);
  const piece = json.choices?.[0]?.delta?.content;
  return piece ?? null;
}

/* ---------- streaming ---------- */

/**
 * Streams a chat completion from a resolved endpoint: any OpenAI-compatible
 * provider or Anthropic's native Messages API. The rest of the app never
 * knows which provider is behind it.
 */
export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
  endpoint?: Endpoint | null,
): AsyncGenerator<string> {
  const e = endpoint ?? envEndpoint();
  if (!e || !e.model)
    throw new HttpError(
      503,
      "La IA no está configurada (añade un proveedor en Ajustes o define LLM_BASE_URL y LLM_MODEL)",
    );

  const req = e.kind === "anthropic" ? anthropicBody(e, messages) : openAiBody(e, messages);
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      // A redirect could hop to plain-HTTP/internal hosts, bypassing the
      // https-or-loopback policy enforced on the saved baseUrl.
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000),
    });
  } catch {
    throw new HttpError(502, `No se pudo contactar con ${e.label}`);
  }
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error("LLM error", e.label, res.status, detail);
    throw new HttpError(502, `${e.label} respondió con un error (${res.status})`);
  }

  const filter = thinkFilter();
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break;
    const piece = deltaText(e.kind, data);
    if (piece) {
      const out = filter(piece);
      if (out) yield out;
    }
  }
}

/** Yields the payload of each `data:` line of a Server-Sent Events stream. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    // A hostile endpoint streaming one endless line would pin unbounded heap.
    if (buffer.length > 1_000_000)
      throw new HttpError(502, "El proveedor de IA envió una respuesta desmesurada");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("data:")) yield line.slice(5).trimStart();
    }
  }
  if (buffer.startsWith("data:")) yield buffer.slice(5).trimStart();
}

/**
 * Drops <think>...</think> reasoning blocks that some open models (Qwen3,
 * DeepSeek-R1) emit inline, even when a tag is split across chunks.
 */
export function thinkFilter(): (piece: string) => string {
  let inside = false;
  let pending = "";
  return (piece) => {
    let s = pending + piece;
    pending = "";
    let out = "";
    while (s) {
      const tag = inside ? "</think>" : "<think>";
      const i = s.indexOf(tag);
      if (i >= 0) {
        if (!inside) out += s.slice(0, i);
        s = s.slice(i + tag.length);
        inside = !inside;
        continue;
      }
      // Keep a possible partial tag at the end for the next chunk.
      let keep = 0;
      for (let k = Math.min(tag.length - 1, s.length); k > 0; k--) {
        if (tag.startsWith(s.slice(-k))) {
          keep = k;
          break;
        }
      }
      if (!inside) out += s.slice(0, s.length - keep);
      pending = s.slice(s.length - keep);
      break;
    }
    return out;
  };
}
