import { LANG_COOKIE, isLang, negotiateLang, type Lang } from "./dictionaries";

/** Same precedence as the pages (cookie > Accept-Language > default), for API routes. */
export function requestLang(req: Request): Lang {
  const m = new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=(\\w+)`).exec(req.headers.get("cookie") ?? "");
  if (m && isLang(m[1])) return m[1];
  return negotiateLang(req.headers.get("accept-language"));
}
