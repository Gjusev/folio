import "server-only";
import { cookies, headers } from "next/headers";
import { DICTS, LANG_COOKIE, isLang, negotiateLang, type Dict, type Lang } from "./dictionaries";

/** Explicit choice (cookie) > browser preference (Accept-Language) > English. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(v)) return v;
  return negotiateLang((await headers()).get("accept-language"));
}

export async function getDict(): Promise<{ lang: Lang; dict: Dict }> {
  const lang = await getLang();
  return { lang, dict: DICTS[lang] };
}
