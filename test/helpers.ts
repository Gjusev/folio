import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as register } from "@/app/api/auth/register/route";

// Re-exported for the unit tests that already imported it from here; the
// fixture itself lives in test/pdf-fixture.ts so e2e can load it without the
// server-only chain.
export { tinyPdf } from "./pdf-fixture";

type Init = { body?: unknown; cookie?: string; headers?: Record<string, string> };

export function request(method: string, path: string, init: Init = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.body !== undefined) headers["content-type"] ??= "application/json";
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const ctx = <P extends Record<string, string>>(params: P) => ({
  params: Promise.resolve(params),
});

/** Registers a fresh user and returns its session cookie header. */
export async function signUp(): Promise<{ cookie: string; email: string }> {
  const email = `user-${randomUUID()}@example.org`;
  const res = await register(
    request("POST", "/api/auth/register", {
      body: { email, name: "Test User", password: "correct horse battery" },
    }),
    undefined,
  );
  if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { cookie: setCookie.split(";")[0], email };
}
