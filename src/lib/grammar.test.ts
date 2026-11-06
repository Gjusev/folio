import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkGrammar } from "@/lib/grammar";

// A LanguageTool stand-in that is alive but slow: every check takes DELAY ms.
const DELAY = 200;
let server: Server;
let url = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () =>
      setTimeout(() => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ matches: [] }));
      }, DELAY),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const prose = "This sentence is long enough to be sent to the grammar checker for review.";
const files = Array.from({ length: 6 }, (_, i) => ({ path: `ch${i}.tex`, content: prose }));

describe("checkGrammar run budget", () => {
  it("stops a slow-but-alive server at the budget and flags the rest truncated", async () => {
    const started = performance.now();
    const r = await checkGrammar(url, "ch0.tex", files, DELAY * 2.5);
    const took = performance.now() - started;
    expect(r.off).toBe(false);
    if (!("issues" in r)) throw new Error(`expected issues, got ${JSON.stringify(r)}`);
    expect(r.filesChecked).toBeGreaterThanOrEqual(1);
    expect(r.filesChecked).toBeLessThan(files.length);
    expect(r.truncated).toBe(true);
    // One in-flight check may overrun by at most its own (clamped) timeout.
    expect(took).toBeLessThan(DELAY * 2.5 + DELAY * 2);
  });

  it("checks every file when the budget is ample", async () => {
    const r = await checkGrammar(url, "ch0.tex", files.slice(0, 2), 10_000);
    if (!("issues" in r)) throw new Error(`expected issues, got ${JSON.stringify(r)}`);
    expect(r.filesChecked).toBe(2);
    expect(r.truncated).toBe(false);
  });
});
