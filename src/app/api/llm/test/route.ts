import { z } from "zod";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { validateBaseUrl } from "@/lib/llm-profiles";

/** Tests an (possibly unsaved) provider config with a 1-token ping. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  enforceRateLimit(`llm-test:${user.id}`, 10, 10 * 60_000);
  const input = await parseJson(
    req,
    z.object({
      kind: z.enum(["openai", "anthropic"]),
      baseUrl: z.string().min(1).max(300),
      apiKey: z.string().max(400).default(""),
      model: z.string().min(1).max(200),
    }),
  );

  // Same policy as saved profiles: this server will fetch the URL, so it must
  // be https (or loopback http) and resolve to a public IP — otherwise it is
  // an internal-network prober.
  const base = (await validateBaseUrl(input.baseUrl.trim())).toString().replace(/\/+$/, "");
  const url = input.kind === "anthropic" ? `${base}/v1/messages` : `${base}/chat/completions`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  const body: Record<string, unknown> =
    input.kind === "anthropic"
      ? { model: input.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }
      : { model: input.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] };
  if (input.kind === "anthropic") {
    headers["x-api-key"] = input.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (input.apiKey) {
    headers.authorization = `Bearer ${input.apiKey}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, "No se pudo contactar con el proveedor (¿URL correcta y accesible?)");
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    console.error("LLM test failed", res.status, detail);
    throw new HttpError(502, `El proveedor respondió ${res.status}: revisa clave, modelo y URL`);
  }
  return Response.json({ ok: true });
});
