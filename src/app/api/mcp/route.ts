import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { handleMcpPost } from "@/lib/mcp/server";

/** One JSON-RPC message per POST; auth travels with every request. */
export const POST = route(handleMcpPost);

const methodNotAllowed = () =>
  NextResponse.json(
    { error: "El servidor MCP de Folio solo acepta POST" },
    { status: 405, headers: { Allow: "POST" } },
  );

/** No SSE stream: clients that GET are told the transport is POST-only. */
export const GET = route(async () => methodNotAllowed());

/** No sessions to terminate. */
export const DELETE = route(async () => methodNotAllowed());
