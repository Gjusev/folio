/**
 * Minimal JSON-RPC 2.0 — exactly what MCP needs: one request or notification
 * per HTTP body, no batching. Pure (no I/O, no server-only) so it unit-tests
 * without a database. Error codes are the standard JSON-RPC ones.
 */

export type JsonRpcId = string | number;

export type JsonRpcErrorObject = { code: number; message: string; data?: unknown };

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result?: unknown;
  error?: JsonRpcErrorObject;
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export type ParsedMessage =
  | { kind: "request"; request: JsonRpcRequest }
  | { kind: "notification"; notification: JsonRpcNotification }
  /** The body was JSON-RPC but malformed: here is the error response to send. */
  | { kind: "error"; response: JsonRpcResponse };

export function parseMessage(raw: string): ParsedMessage {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "error", response: errorResponse(null, PARSE_ERROR, "Parse error") };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { kind: "error", response: errorResponse(null, INVALID_REQUEST, "Invalid Request") };
  }
  const msg = value as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const id = isId(msg.id) ? msg.id : null;
  if (typeof msg.method !== "string" || msg.method === "") {
    return { kind: "error", response: errorResponse(id, INVALID_REQUEST, "Invalid Request") };
  }
  if (msg.jsonrpc !== "2.0") {
    return {
      kind: "error",
      response: errorResponse(id, INVALID_REQUEST, 'Expected jsonrpc "2.0"'),
    };
  }
  if (id !== null) {
    return {
      kind: "request",
      request: { jsonrpc: "2.0", id, method: msg.method, params: msg.params },
    };
  }
  return {
    kind: "notification",
    notification: { jsonrpc: "2.0", method: msg.method, params: msg.params },
  };
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

export function resultResponse(id: JsonRpcId | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  const error: JsonRpcErrorObject = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}
