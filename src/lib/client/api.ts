import { DICTS, DEFAULT_LANG, type MsgKey } from "@/lib/i18n/dictionaries";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// Known server messages, localized on the client. The cookie is read directly
// because this helper runs outside React; without one, <html lang> carries the
// language the server negotiated from Accept-Language.
function lang(): string {
  const m = /(?:^|;\s*)folio_lang=(\w{2})/.exec(document.cookie);
  if (m && m[1] in DICTS) return m[1];
  const html = document.documentElement.lang.slice(0, 2);
  return html in DICTS ? html : DEFAULT_LANG;
}

const MESSAGES: [RegExp, MsgKey][] = [
  [/^Correo o contraseña incorrectos/, "api.invalidCredentials"],
  [/^Ya existe una cuenta con ese correo/, "api.emailTaken"],
  [/^Datos no válidos/, "api.validation"],
  [/^Ya existe un archivo con esa ruta/, "api.conflict.file"],
  [/^El archivo se modificó en otra sesión/, "api.conflict.save"],
  [/supera 1 ?MB/, "api.tooLarge.file"],
  [/supera 10 ?MB/, "api.tooLarge.figure"],
  [/supera 50 ?MB/, "api.tooLarge.project"],
  [/supera 30 ?MB/, "api.tooLarge.zip"],
  [/^Demasiadas peticiones/, "api.rateLimited"],
  [/^Sin DOIs en la bibliografía/, "api.noDois"],
  [/^Sin recomendaciones/, "api.noDois"],
  [/^Ese trabajo no tiene DOI/, "api.noGraphDoi"],
  [/^Perfil desconocido|perfil del \.env/, "api.badProfile"],
  [/^Para guardar claves API/, "api.needSealKey"],
];

function localize(message: string): string {
  const dict = DICTS[lang() as keyof typeof DICTS];
  for (const [re, key] of MESSAGES) if (re.test(message)) return dict[key];
  return message;
}

/** JSON fetch for our own API. Throws ApiError with a user-facing message. */
export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(
      0,
      err instanceof TypeError ? DICTS[lang() as keyof typeof DICTS].offline : String(err),
    );
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = data.issues?.[0]?.message;
    throw new ApiError(res.status, localize(issue ?? data.error ?? `Error ${res.status}`), data);
  }
  return data as T;
}
