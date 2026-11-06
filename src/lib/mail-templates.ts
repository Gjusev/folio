// Pure e-mail templates (es/en/de). Every interpolated value is HTML-escaped:
// project and inviter names are user input, rendered by the recipient's mail client.
import type { Lang } from "@/lib/i18n/dictionaries";

export type MailContent = { subject: string; text: string; html: string };

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Plain paragraphs + one button-like link; `paras` are raw text, escaped here. */
function render(paras: string[], link: string, action: string, foot: string): MailContent["html"] {
  const p = (s: string) => `<p style="margin:0 0 16px">${escapeHtml(s)}</p>`;
  return [
    `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:520px">`,
    ...paras.map(p),
    `<p style="margin:0 0 16px"><a href="${escapeHtml(link)}" style="color:#fff;background:#2f5d50;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action)}</a></p>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#555">${escapeHtml(link)}</p>`,
    `<p style="margin:0;font-size:13px;color:#555">${escapeHtml(foot)}</p>`,
    `</div>`,
  ].join("\n");
}

const RESET: Record<
  Lang,
  { subject: string; intro: string; action: string; expires: (m: number) => string; ignore: string }
> = {
  es: {
    subject: "Restablece tu contraseña de Folio",
    intro: "Alguien (seguramente tú) pidió restablecer la contraseña de tu cuenta de Folio.",
    action: "Elegir una contraseña nueva",
    expires: (m) => `El enlace caduca en ${m} minutos y solo sirve una vez.`,
    ignore: "Si no lo pediste, ignora este correo: tu contraseña no cambia.",
  },
  en: {
    subject: "Reset your Folio password",
    intro: "Someone (probably you) asked to reset the password of your Folio account.",
    action: "Choose a new password",
    expires: (m) => `The link expires in ${m} minutes and works only once.`,
    ignore: "If you did not ask for this, ignore this e-mail: your password stays the same.",
  },
  de: {
    subject: "Setze dein Folio-Passwort zurück",
    intro:
      "Jemand (wahrscheinlich du) hat angefordert, das Passwort deines Folio-Kontos zurückzusetzen.",
    action: "Neues Passwort wählen",
    expires: (m) => `Der Link läuft in ${m} Minuten ab und funktioniert nur einmal.`,
    ignore:
      "Wenn du das nicht angefordert hast, ignoriere diese E-Mail: dein Passwort bleibt gleich.",
  },
};

export function resetEmail(lang: Lang, link: string, minutes: number): MailContent {
  const s = RESET[lang];
  return {
    subject: s.subject,
    text: [s.intro, `${s.action}: ${link}`, s.expires(minutes), s.ignore].join("\n\n"),
    html: render([s.intro, s.expires(minutes)], link, s.action, s.ignore),
  };
}

type Invite = { inviterName: string; projectName: string; role: "editor" | "viewer"; link: string };

const INVITE: Record<
  Lang,
  {
    subject: (i: Invite) => string;
    body: (i: Invite, role: string) => string;
    roles: Record<Invite["role"], string>;
    action: string;
    foot: string;
  }
> = {
  es: {
    subject: (i) => `${i.inviterName} te invitó a «${i.projectName}» en Folio`,
    body: (i, role) =>
      `${i.inviterName} te dio acceso como ${role} al proyecto «${i.projectName}».`,
    roles: { editor: "editor", viewer: "lector" },
    action: "Abrir el proyecto",
    foot: "Inicia sesión con tu cuenta de Folio para verlo.",
  },
  en: {
    subject: (i) => `${i.inviterName} invited you to “${i.projectName}” on Folio`,
    body: (i, role) =>
      `${i.inviterName} gave you ${role} access to the project “${i.projectName}”.`,
    roles: { editor: "editor", viewer: "viewer" },
    action: "Open the project",
    foot: "Sign in with your Folio account to see it.",
  },
  de: {
    subject: (i) => `${i.inviterName} hat dich zu „${i.projectName}“ auf Folio eingeladen`,
    body: (i, role) =>
      `${i.inviterName} hat dir Zugriff als ${role} auf das Projekt „${i.projectName}“ gegeben.`,
    roles: { editor: "Editor", viewer: "Leser" },
    action: "Projekt öffnen",
    foot: "Melde dich mit deinem Folio-Konto an, um es zu sehen.",
  },
};

export function inviteEmail(lang: Lang, invite: Invite): MailContent {
  const s = INVITE[lang];
  const body = s.body(invite, s.roles[invite.role]);
  return {
    subject: s.subject(invite),
    text: [body, `${s.action}: ${invite.link}`, s.foot].join("\n\n"),
    html: render([body], invite.link, s.action, s.foot),
  };
}
