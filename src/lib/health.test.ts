import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

const ok = async () => {};
const boom = async () => {
  throw new Error("down");
};
const hang = () => new Promise<void>(() => {});

describe("checkHealth", () => {
  it("is ok when every probe passes", async () => {
    expect(await checkHealth({ db: ok, compiler: ok })).toEqual({
      ok: true,
      db: "ok",
      compiler: "ok",
    });
  });

  it("reports the failing dependency and is not ok", async () => {
    expect(await checkHealth({ db: boom, compiler: ok })).toEqual({
      ok: false,
      db: "down",
      compiler: "ok",
    });
  });

  it("treats a probe that hangs as down after the timeout", async () => {
    const started = Date.now();
    const r = await checkHealth({ db: ok, compiler: hang }, 50);
    expect(r).toEqual({ ok: false, db: "ok", compiler: "down" });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
