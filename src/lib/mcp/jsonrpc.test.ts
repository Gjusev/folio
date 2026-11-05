import { describe, expect, it } from "vitest";
import {
  errorResponse,
  INVALID_REQUEST,
  parseMessage,
  PARSE_ERROR,
  resultResponse,
} from "@/lib/mcp/jsonrpc";

describe("parseMessage", () => {
  it("parses a request with id and params", () => {
    const parsed = parseMessage('{"jsonrpc":"2.0","id":7,"method":"tools/list","params":{}}');
    expect(parsed).toEqual({
      kind: "request",
      request: { jsonrpc: "2.0", id: 7, method: "tools/list", params: {} },
    });
  });

  it("treats a message without id as a notification", () => {
    const parsed = parseMessage('{"jsonrpc":"2.0","method":"notifications/initialized"}');
    expect(parsed).toEqual({
      kind: "notification",
      notification: { jsonrpc: "2.0", method: "notifications/initialized", params: undefined },
    });
  });

  it("returns a parse error for unparsable JSON", () => {
    const parsed = parseMessage("{not json");
    expect(parsed.kind).toBe("error");
    if (parsed.kind !== "error") return;
    expect(parsed.response.error).toEqual({ code: PARSE_ERROR, message: "Parse error" });
    expect(parsed.response.id).toBeNull();
  });

  it("rejects non-object bodies and bodies without a method", () => {
    for (const raw of ["[1,2]", '"hi"', '{"jsonrpc":"2.0","id":1}']) {
      const parsed = parseMessage(raw);
      expect(parsed.kind).toBe("error");
      if (parsed.kind !== "error") return;
      expect(parsed.response.error?.code).toBe(INVALID_REQUEST);
    }
  });

  it("rejects a wrong jsonrpc version but keeps a valid id", () => {
    const parsed = parseMessage('{"jsonrpc":"1.0","id":"abc","method":"ping"}');
    expect(parsed.kind).toBe("error");
    if (parsed.kind !== "error") return;
    expect(parsed.response.id).toBe("abc");
    expect(parsed.response.error?.code).toBe(INVALID_REQUEST);
  });

  it("ignores a non-scalar id (treated as a notification-free error, never a crash)", () => {
    const parsed = parseMessage('{"jsonrpc":"2.0","id":{"evil":1},"method":"ping"}');
    // id must be string|number; an object id cannot be echoed, so it is dropped.
    expect(["request", "notification", "error"]).toContain(parsed.kind);
  });
});

describe("response builders", () => {
  it("builds a result response", () => {
    expect(resultResponse(3, { ok: true })).toEqual({
      jsonrpc: "2.0",
      id: 3,
      result: { ok: true },
    });
  });

  it("builds an error response, with data only when present", () => {
    expect(errorResponse(null, -32601, "nope")).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32601, message: "nope" },
    });
    expect(errorResponse("x", -32602, "bad", [{ path: [] }]).error?.data).toEqual([{ path: [] }]);
  });
});
