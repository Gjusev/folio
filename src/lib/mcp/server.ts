import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { authenticateApiRequest, requireScope, type ApiIdentity } from "@/lib/api-tokens";
import { HttpError } from "@/lib/http";
import { findTool, toolDescriptors } from "@/lib/mcp/tools";
import {
  errorResponse,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  METHOD_NOT_FOUND,
  parseMessage,
  resultResponse,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/lib/mcp/jsonrpc";

/**
 * Folio's MCP server over Streamable HTTP, JSON-only flavour: every POST is one
 * self-contained JSON-RPC message that carries its own auth (Bearer agent
 * token or session cookie) and gets one plain `application/json` response.
 * There is no server state at all — no session id, no SSE stream, nothing
 * remembered from `initialize` — so any load-balanced instance answers. Any
 * message without an id is a notification and gets 202 with an empty body.
 * JSON-RPC-level failures (unknown method, bad params, unparsable body) come
 * back as HTTP 200 with the error object in the body; only auth is an HTTP error.
 */

const LATEST_PROTOCOL = "2025-06-18";
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$/;

const toolCall = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

export async function handleMcpPost(req: NextRequest): Promise<Response> {
  const identity = await authenticateApiRequest(req);
  if (!identity) {
    return NextResponse.json(
      { error: "Autenticación requerida: envía un token Bearer o la cookie de sesión" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  const message = parseMessage(await req.text());
  if (message.kind === "error") return NextResponse.json(message.response);
  if (message.kind === "notification") return new NextResponse(null, { status: 202 });
  return NextResponse.json(await dispatch(identity, message.request));
}

async function dispatch(identity: ApiIdentity, req: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    switch (req.method) {
      case "initialize": {
        // Echo the client's version when it is date-shaped (all MCP revisions
        // are), else fall back to the revision we implement.
        const params = (req.params ?? {}) as { protocolVersion?: unknown };
        const protocolVersion =
          typeof params.protocolVersion === "string" && DATE_LIKE.test(params.protocolVersion)
            ? params.protocolVersion
            : LATEST_PROTOCOL;
        return resultResponse(req.id, {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "folio", version: "0.1.0" },
        });
      }
      case "ping":
        return resultResponse(req.id, {});
      case "tools/list":
        return resultResponse(req.id, toolDescriptors());
      case "tools/call":
        return await callTool(identity, req);
      default:
        return errorResponse(req.id, METHOD_NOT_FOUND, `Unknown method: ${req.method}`);
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return errorResponse(req.id, INVALID_PARAMS, "Invalid params", err.issues);
    }
    console.error(`[mcp ${req.method}]`, err);
    return errorResponse(req.id, INTERNAL_ERROR, "Internal error");
  }
}

async function callTool(identity: ApiIdentity, req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { name, arguments: args } = toolCall.parse(req.params ?? {});
  const tool = findTool(name);
  if (!tool) return errorResponse(req.id, INVALID_PARAMS, `Unknown tool: ${name}`);
  try {
    for (const scope of tool.scopes) requireScope(identity, scope);
    const params = tool.input.parse(args ?? {});
    const result = await tool.run(identity, params);
    return resultResponse(req.id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 1) }],
    });
  } catch (err) {
    // A tool that refuses (bad input state, missing scope, 404, conflict)
    // is a normal MCP result the agent can act on — not a protocol error.
    if (err instanceof HttpError) {
      return resultResponse(req.id, {
        content: [{ type: "text", text: err.message }],
        isError: true,
      });
    }
    throw err; // ZodError → -32602 in dispatch; anything else → -32603
  }
}
