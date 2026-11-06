import { afterAll, describe, expect, it, vi } from "vitest";
import { POST as grammar } from "@/app/api/projects/[id]/grammar/route";
import { POST as createProject } from "@/app/api/projects/route";
import { closeDb } from "@/lib/db";
import { ctx, request, signUp } from "../../../../../../test/helpers";

// Its own file: env() is cached per module graph, so "off" needs a fresh one.
vi.hoisted(() => {
  process.env.LANGUAGETOOL_URL = "";
});

afterAll(async () => {
  await closeDb();
});

describe("POST /api/projects/[id]/grammar without LANGUAGETOOL_URL", () => {
  it("answers { off: true } and touches no network", async () => {
    const { cookie } = await signUp();
    const created = await createProject(
      request("POST", "/api/projects", { cookie, body: { name: "No grammar" } }),
      undefined,
    );
    const { project } = await created.json();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const res = await grammar(
        request("POST", `/api/projects/${project.id}/grammar`, { cookie }),
        ctx({ id: project.id }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ off: true });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("still enforces sign-in", async () => {
    const res = await grammar(request("POST", "/api/projects/x/grammar"), ctx({ id: "x" }));
    expect(res.status).toBe(401);
  });
});
