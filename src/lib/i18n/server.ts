import "server-only";
import { cookies } from "next/headers";
import { DICTS, DEFAULT_LANG, LANG_COOKIE, isLang, type Dict, type Lang } from "./dictionaries";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

export async function getDict(): Promise<{ lang: Lang; dict: Dict }> {
  const lang = await getLang();
  return { lang, dict: DICTS[lang] };
}
