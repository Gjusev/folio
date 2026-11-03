import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { SESSION_COOKIE, getSessionUser, type SessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler: CSRF origin check, uniform JSON errors, no leaked internals. */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        const headers: Record<string, string> = {};
        if (err.status === 429 && err.extra?.retryAfter) {
          headers["Retry-After"] = String(err.extra.retryAfter);
        }
        return NextResponse.json(
          { error: err.message, ...err.extra },
          { status: err.status, headers },
        );
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Datos no válidos",
            issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
          },
          { status: 400 },
        );
      }
      console.error(`[${req.method} ${req.nextUrl.pathname}]`, err);
      return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
  };
}

/** Browsers always send Origin on cross-site non-GET requests; reject foreign ones. */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, tests); cookies are SameSite=Lax anyway
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Origen no permitido");
  }
  if (originHost !== host) throw new HttpError(403, "Origen no permitido");
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "Se esperaba application/json");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "JSON mal formado");
  }
  return schema.parse(body);
}

export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new HttpError(401, "Inicia sesión para continuar");
  return user;
}

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const wait = rateLimit(key, limit, windowMs);
  if (wait > 0) {
    throw new HttpError(429, "Demasiadas peticiones, inténtalo de nuevo en unos segundos", {
      retryAfter: wait,
    });
  }
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
