import { afterAll, describe, expect, it } from "vitest";
import {
  GET as getPreferencesRoute,
  PUT as putPreferencesRoute,
} from "@/app/api/preferences/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { request, signUp } from "../../../../test/helpers";

afterAll(async () => {
  await closeDb();
});

describe("preferences API", () => {
  it("refuses guests with 401", async () => {
    const res = await getPreferencesRoute(request("GET", "/api/preferences"), undefined);
    expect(res.status).toBe(401);
  });

  it("returns defaults for a fresh session user", async () => {
    const { cookie } = await signUp();
    const res = await getPreferencesRoute(
      request("GET", "/api/preferences", { cookie }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      appearance: { theme: "system", uiFont: "plex", fontScale: "m", editorFont: "plex-mono" },
      onboarding: { done: [] },
    });
  });

  it("PUT merges a partial update and keeps the rest", async () => {
    resetRateLimits();
    const { cookie } = await signUp();

    const first = await putPreferencesRoute(
      request("PUT", "/api/preferences", {
        cookie,
        body: { appearance: { theme: "dark", uiFont: "switzer" }, onboarding: { done: ["a"] } },
      }),
      undefined,
    );
    expect(first.status).toBe(200);
    expect(
      ((await first.json()) as { appearance: { theme: string; uiFont: string } }).appearance,
    ).toMatchObject({ theme: "dark", uiFont: "switzer" });

    // Only fontScale changes; theme, uiFont and onboarding survive.
    const second = await putPreferencesRoute(
      request("PUT", "/api/preferences", { cookie, body: { appearance: { fontScale: "l" } } }),
      undefined,
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      appearance: { theme: "dark", uiFont: "switzer", fontScale: "l", editorFont: "plex-mono" },
      onboarding: { done: ["a"] },
    });
  });

  it("rejects unknown values with 400", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    const res = await putPreferencesRoute(
      request("PUT", "/api/preferences", { cookie, body: { appearance: { theme: "sepia" } } }),
      undefined,
    );
    expect(res.status).toBe(400);
  });

  it("rate-limits writes: 30 per 10 minutes", async () => {
    resetRateLimits();
    const { cookie } = await signUp();
    for (let i = 0; i < 30; i++) {
      const res = await putPreferencesRoute(
        request("PUT", "/api/preferences", { cookie, body: { appearance: { theme: "dark" } } }),
        undefined,
      );
      expect(res.status).toBe(200);
    }
    const blocked = await putPreferencesRoute(
      request("PUT", "/api/preferences", { cookie, body: { appearance: { theme: "dark" } } }),
      undefined,
    );
    expect(blocked.status).toBe(429);
  });
});
