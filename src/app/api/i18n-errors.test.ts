import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createProject } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { PUT as saveFile } from "@/app/api/projects/[id]/files/[fileId]/route";
import { POST as createToken } from "@/app/api/tokens/route";
import { DELETE as deleteToken } from "@/app/api/tokens/[id]/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

// Server-side error messages follow the folio_lang cookie; without it the
// Spanish text (the es dictionary source) is what the API has always returned.

type FileDto = { id: string; path: string; version: number };

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

async function newProjectMainFile(cookie: string): Promise<{ id: string; file: FileDto }> {
  const res = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "i18n errors" } }),
    undefined,
  );
  expect(res.status).toBe(201);
  const { project } = await res.json();
  const detail = await getProject(
    request("GET", `/api/projects/${project.id}`, { cookie }),
    ctx({ id: project.id }),
  );
  const { files } = (await detail.json()) as { files: FileDto[] };
  return { id: project.id as string, file: files[0] };
}

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

describe("API error i18n", () => {
  it("login 401 follows the folio_lang cookie, Spanish without it", async () => {
    const body = { email: "nobody@example.org", password: "wrong password" };
    const en = await login(
      request("POST", "/api/auth/login", { headers: { cookie: "folio_lang=en" }, body }),
      undefined,
    );
    expect(en.status).toBe(401);
    expect(await errorOf(en)).toBe("Wrong e-mail or password");

    const de = await login(
      request("POST", "/api/auth/login", { headers: { cookie: "folio_lang=de" }, body }),
      undefined,
    );
    expect(de.status).toBe(401);
    expect(await errorOf(de)).toBe("E-Mail oder Passwort falsch");

    const es = await login(request("POST", "/api/auth/login", { body }), undefined);
    expect(es.status).toBe(401);
    expect(await errorOf(es)).toBe("Correo o contraseña incorrectos");
  });

  it("login 429 is translated too and keeps the Retry-After header", async () => {
    const email = `limited-${Date.now()}@example.org`;
    const body = { email, password: "x" };
    for (let i = 0; i < 10; i++) {
      await login(request("POST", "/api/auth/login", { body }), undefined);
    }
    const res = await login(
      request("POST", "/api/auth/login", { headers: { cookie: "folio_lang=en" }, body }),
      undefined,
    );
    expect(res.status).toBe(429);
    expect(await errorOf(res)).toBe("Too many requests, try again in a few seconds");
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("files save 409 (conflict) is translated", async () => {
    const { cookie } = await signUp();
    const { id, file } = await newProjectMainFile(cookie);
    const save = (lang?: string) =>
      saveFile(
        request("PUT", `/api/projects/${id}/files/${file.id}`, {
          // Session + language in one Cookie header (request() would overwrite).
          headers: { cookie: lang ? `${cookie}; folio_lang=${lang}` : cookie },
          body: { content: "x", baseVersion: 99 }, // the server is at version 1
        }),
        ctx({ id, fileId: file.id }),
      );
    const en = await save("en");
    expect(en.status).toBe(409);
    expect(await errorOf(en)).toBe("The file changed in another session");

    const de = await save("de");
    expect(de.status).toBe(409);
    expect(await errorOf(de)).toBe("Die Datei wurde in einer anderen Sitzung geändert");

    const es = await save();
    expect(es.status).toBe(409);
    expect(await errorOf(es)).toBe("El archivo se modificó en otra sesión");
  });

  it("tokens 403 (a token managing tokens) is translated", async () => {
    const { cookie } = await signUp();
    const created = await createToken(
      request("POST", "/api/tokens", { cookie, body: { name: "agent", scopes: ["read"] } }),
      undefined,
    );
    expect(created.status).toBe(201);
    const { token, id } = (await created.json()) as { token: string; id: string };

    const call = (lang?: string) =>
      deleteToken(
        request("DELETE", `/api/tokens/${id}`, {
          headers: {
            authorization: `Bearer ${token}`,
            ...(lang ? { cookie: `folio_lang=${lang}` } : {}),
          },
        }),
        ctx({ id }),
      );
    const en = await call("en");
    expect(en.status).toBe(403);
    expect(await errorOf(en)).toBe("Tokens cannot manage tokens");

    const de = await call("de");
    expect(de.status).toBe(403);
    expect(await errorOf(de)).toBe("Tokens können keine Tokens verwalten");

    const es = await call();
    expect(es.status).toBe(403);
    expect(await errorOf(es)).toBe("Los tokens no pueden gestionar tokens");
  });
});
