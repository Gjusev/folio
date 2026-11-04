import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createDemo } from "@/app/api/projects/demo/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

beforeEach(() => resetRateLimits());
afterAll(closeDb);

describe("POST /api/projects/demo", () => {
  it("requires a session", async () => {
    const res = await createDemo(request("POST", "/api/projects/demo", { body: {} }), undefined);
    expect(res.status).toBe(401);
  });

  it("creates the localised demo project with its three files", async () => {
    const { cookie } = await signUp();
    const res = await createDemo(
      request("POST", "/api/projects/demo", { cookie, body: { lang: "de" } }),
      undefined,
    );
    expect(res.status).toBe(201);
    const { project } = await res.json();
    expect(project.name).toMatch(/Attention in neuronalen Netzen/);
    const detail = await getProject(
      request("GET", `/api/projects/${project.id}`, { cookie }),
      ctx({ id: project.id }),
    );
    const { files } = (await detail.json()) as { files: { path: string }[] };
    expect(files.map((f) => f.path).sort()).toEqual([
      "figures/attention.tex",
      "main.tex",
      "references.bib",
    ]);
  });

  it("falls back to Accept-Language, then English", async () => {
    const { cookie } = await signUp();
    const es = await createDemo(
      request("POST", "/api/projects/demo", {
        cookie,
        body: {},
        headers: { "accept-language": "es-ES,es;q=0.9" },
      }),
      undefined,
    );
    expect((await es.json()).project.name).toMatch(/atención/i);
    const none = await createDemo(
      request("POST", "/api/projects/demo", { cookie, body: {} }),
      undefined,
    );
    expect((await none.json()).project.name).toMatch(/Demo: attention/);
  });

  it("rejects an unsupported language", async () => {
    const { cookie } = await signUp();
    const res = await createDemo(
      request("POST", "/api/projects/demo", { cookie, body: { lang: "fr" } }),
      undefined,
    );
    expect(res.status).toBe(400);
  });
});
