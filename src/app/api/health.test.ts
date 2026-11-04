import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { closeDb } from "@/lib/db";
import { request } from "../../../test/helpers";

afterAll(closeDb);

describe("GET /api/health", () => {
  it("answers without a session, never cached, status matching the report", async () => {
    const res = await GET(request("GET", "/api/health"), undefined);
    const body = await res.json();
    expect(body.db).toBe("ok"); // the test database is up
    expect(["ok", "down"]).toContain(body.compiler);
    expect(res.status).toBe(body.ok ? 200 : 503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual(["compiler", "db", "ok"]); // nothing else leaks
  });
});
