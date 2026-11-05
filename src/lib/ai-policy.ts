import "server-only";
import { lookup } from "node:dns/promises";
import { HttpError } from "@/lib/http";
import { isPrivateIp, resolveEndpoint, type Endpoint } from "@/lib/llm-profiles";
import type { Task } from "@/lib/llm-presets";

// Per-project AI policy. Keys are per user (BYOK), but the manuscript belongs to
// the project: its owner decides whether it may be sent to AI providers at all,
// and the rule binds every collaborator, whatever key they bring.
//
//   any   — each user's own routing, unrestricted (the default)
//   local — only endpoints whose host resolves to loopback/private addresses,
//           i.e. the request never leaves this server's network (Ollama, vLLM…)
//   off   — no AI on this project for anyone
export const AI_POLICIES = ["any", "local", "off"] as const;
export type AiPolicy = (typeof AI_POLICIES)[number];

export function asPolicy(value: unknown): AiPolicy {
  return AI_POLICIES.includes(value as AiPolicy) ? (value as AiPolicy) : "any";
}

/**
 * True when every address the endpoint's host resolves to is loopback or
 * private. Unparseable URLs and DNS failures count as remote: the policy
 * fails closed.
 */
export async function isLocalEndpoint(baseUrl: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  try {
    const ips = await lookup(host, { all: true });
    return ips.length > 0 && ips.every((r) => isPrivateIp(r.address));
  } catch {
    return false;
  }
}

/**
 * The endpoint `userId` may use on `project`: the user's own routing (BYOK)
 * filtered by the project's policy. `null` means no provider is configured
 * (callers keep answering 503). Throws 403 when the owner turned AI off, or
 * restricted the project to local models and this user's endpoint is remote.
 */
export async function resolveProjectEndpoint(
  userId: string,
  project: { aiPolicy: string },
  task: Task,
): Promise<Endpoint | null> {
  const policy = asPolicy(project.aiPolicy);
  if (policy === "off")
    throw new HttpError(
      403,
      "La IA está desactivada en este proyecto por decisión de su propietario",
    );
  const endpoint = await resolveEndpoint(userId, task);
  if (!endpoint || policy === "any") return endpoint;
  if (!(await isLocalEndpoint(endpoint.baseUrl)))
    throw new HttpError(
      403,
      "En este proyecto solo se permiten modelos locales: configura un proveedor local (Ollama, vLLM) en Ajustes",
    );
  return endpoint;
}
