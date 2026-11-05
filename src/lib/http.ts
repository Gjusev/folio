import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { SESSION_COOKIE, getSessionUser, type SessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import {
  DICTS,
  LANG_COOKIE,
  format,
  isLang,
  type Dict,
  type MsgKey,
} from "@/lib/i18n/dictionaries";
import { rateLimit } from "@/lib/rate-limit";

export class HttpError extends Error {
  /** Dictionary key: when set, route() renders the message in the caller's language. */
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
    readonly key?: string,
    readonly vars?: Record<string, string | number>,
  ) {
    super(message);
  }
}

/** HttpError whose message comes from the dictionaries (es text, key attached). */
export function fail(
  status: number,
  key: MsgKey,
  vars?: Record<string, string | number>,
  extra?: Record<string, unknown>,
): HttpError {
  return new HttpError(status, format(DICTS.es, key, vars), extra, key, vars);
}

/** Dict for this request's language: the folio_lang cookie, else Spanish. */
export function reqDict(req: NextRequest): Dict {
  const lang = req.cookies.get(LANG_COOKIE)?.value;
  return isLang(lang) ? DICTS[lang] : DICTS.es;
}

/** err.message in the request's language; unknown key keeps the Spanish text. */
function localized(req: NextRequest, err: HttpError): string {
  if (!err.key) return err.message;
  const dict = reqDict(req);
  return err.key in dict ? format(dict, err.key as MsgKey, err.vars) : err.message;
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
          { error: localized(req, err), ...err.extra },
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
      return NextResponse.json(
        { error: localized(req, fail(500, "api.common.internal")) },
        {
          status: 500,
        },
      );
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
    throw fail(403, "api.common.badOrigin");
  }
  if (originHost !== host) throw fail(403, "api.common.badOrigin");
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw fail(415, "api.common.expectedJson");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw fail(400, "api.common.malformedJson");
  }
  return schema.parse(body);
}

export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw fail(401, "api.common.signInRequired");
  return user;
}

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const factor = env().RATE_LIMIT_MULTIPLIER;
  const wait = rateLimit(key, factor === 1 ? limit : Math.ceil(limit * factor), windowMs);
  if (wait > 0) {
    throw new HttpError(
      429,
      format(DICTS.es, "api.common.rateLimited"),
      { retryAfter: wait },
      "api.common.rateLimited",
    );
  }
}

export function clientIp(req: NextRequest): string {
  // Take the LAST X-Forwarded-For entry: it is the one appended by the trusted
  // proxy closest to us. Earlier entries are supplied by the client and can be
  // forged, so taking the first one let anyone mint a fresh rate-limit bucket
  // per request. Caveat: this only holds behind a proxy that manages the
  // header; without one the whole XFF is attacker data — which is why login
  // also rate-limits per e-mail, independent of IP.
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",").pop()?.trim() || "local";
}
