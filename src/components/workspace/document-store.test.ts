import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/api";
import { DocumentStore } from "./document-store";

type Call = { method: string; url: string; body: { content: string; baseVersion: number } };

function setup(responder: (call: Call) => Promise<unknown>) {
  const calls: Call[] = [];
  const request = vi.fn(async (method: string, url: string, body?: unknown) => {
    const call = { method, url, body: body as Call["body"] };
    calls.push(call);
    return responder(call);
  }) as unknown as ConstructorParameters<typeof DocumentStore>[2];
  const store = new DocumentStore(
    "p1",
    [{ id: "f1", path: "main.tex", content: "a", version: 1 }],
    request,
    {
      autosave: 100,
      retry: 500,
    },
  );
  return { store, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("DocumentStore", () => {
  it("debounces edits into one save with the base version", async () => {
    let version = 1;
    const { store, calls } = setup(async () => ({ version: ++version }));
    store.edit("f1", "ab");
    store.edit("f1", "abc");
    expect(store.getSnapshot().status).toBe("dirty");
    await vi.advanceTimersByTimeAsync(150);
    expect(calls).toEqual([
      { method: "PUT", url: "/api/projects/p1/files/f1", body: { content: "abc", baseVersion: 1 } },
    ]);
    expect(store.getSnapshot().status).toBe("saved");

    store.edit("f1", "abcd");
    await store.flush();
    expect(calls[1].body).toEqual({ content: "abcd", baseVersion: 2 });
    expect(store.hasUnsaved()).toBe(false);
  });

  it("saves edits made while a save is in flight", async () => {
    let release!: () => void;
    let version = 1;
    const { store, calls } = setup(
      () => new Promise((r) => (release = () => r({ version: ++version }))),
    );
    store.edit("f1", "first");
    await vi.advanceTimersByTimeAsync(150);
    expect(store.getSnapshot().status).toBe("saving");
    store.edit("f1", "second");
    release();
    await vi.advanceTimersByTimeAsync(150);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.body)).toEqual([
      { content: "first", baseVersion: 1 },
      { content: "second", baseVersion: 2 },
    ]);
    expect(store.getSnapshot().status).toBe("saved");
  });

  it("stops on conflict and lets the user keep either copy", async () => {
    let n = 0;
    const { store, calls } = setup(async (call) => {
      if (n++ === 0)
        throw new ApiError(409, "conflict", { current: { content: "server", version: 5 } });
      return { version: call.body.baseVersion + 1 };
    });
    store.edit("f1", "mine");
    await vi.advanceTimersByTimeAsync(150);
    expect(store.getSnapshot().status).toBe("conflict");
    expect(store.getSnapshot().conflict).toEqual({
      fileId: "f1",
      path: "main.tex",
      content: "server",
      version: 5,
    });

    store.edit("f1", "mine, more");
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1); // no autosave while in conflict

    store.keepMine();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[1].body).toEqual({ content: "mine, more", baseVersion: 5 });
    expect(store.getSnapshot().status).toBe("saved");
  });

  it("can discard local changes in favour of the server copy", async () => {
    const { store } = setup(async () => {
      throw new ApiError(409, "conflict", { current: { content: "server", version: 3 } });
    });
    store.edit("f1", "mine");
    await vi.advanceTimersByTimeAsync(150);
    expect(store.takeServer()?.content).toBe("server");
    expect(store.getDoc("f1")).toBe("server");
    expect(store.getSnapshot().status).toBe("saved");
  });

  it("keeps changes and retries after a network error", async () => {
    let fail = true;
    const { store, calls } = setup(async () => {
      if (fail) throw new ApiError(0, "Sin conexión con el servidor");
      return { version: 2 };
    });
    store.edit("f1", "offline edit");
    await vi.advanceTimersByTimeAsync(150);
    expect(store.getSnapshot()).toMatchObject({
      status: "error",
      error: "Sin conexión con el servidor",
    });
    expect(store.getDoc("f1")).toBe("offline edit");
    fail = false;
    await vi.advanceTimersByTimeAsync(600);
    expect(calls).toHaveLength(2);
    expect(store.getSnapshot()).toMatchObject({ status: "saved", error: null });
  });
});
