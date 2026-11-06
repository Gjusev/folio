// Strings of the optional e-mail features: password reset pages, the login
// link, the share-menu suffix and their API errors. `es` is the source of
// truth; `en` and `de` are typed against it.

const es = {
  "auth.forgot.link": "¿Olvidaste la contraseña?",
  "auth.forgot.t": "Restablecer la contraseña",
  "auth.forgot.d":
    "Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.",
  "auth.forgot.submit": "Enviar enlace",
  "auth.forgot.sent":
    "Si existe una cuenta con ese correo, te llega un e-mail en unos minutos. El enlace caduca en 30 minutos.",
  "auth.forgot.off":
    "Este servidor no envía correos. Pide a quien lo administra que ejecute «pnpm reset-password» para restablecer tu contraseña.",
  "auth.reset.t": "Elige una contraseña nueva",
  "auth.reset.password": "Contraseña nueva",
  "auth.reset.confirm": "Repite la contraseña",
  "auth.reset.mismatch": "Las contraseñas no coinciden",
  "auth.reset.submit": "Guardar contraseña",
  "auth.reset.done":
    "Contraseña cambiada. Se cerraron todas tus sesiones: entra con la contraseña nueva.",
  "auth.reset.invalid.t": "Enlace no válido",
  "auth.reset.invalid.d": "El enlace caducó, ya se usó o está incompleto. Pide uno nuevo.",
  "auth.reset.again": "Pedir otro enlace",
  "auth.backToLogin": "Volver a iniciar sesión",
  "share.emailed": "e-mail enviado",
  "api.auth.resetOff": "El restablecimiento por correo no está activado en esta instancia",
  "api.auth.resetInvalid": "El enlace no es válido o ha caducado",
} as const;

const en: Record<keyof typeof es, string> = {
  "auth.forgot.link": "Forgot your password?",
  "auth.forgot.t": "Reset your password",
  "auth.forgot.d":
    "Enter your account's e-mail and we will send you a link to choose a new password.",
  "auth.forgot.submit": "Send link",
  "auth.forgot.sent":
    "If an account exists for that e-mail, a message is on its way. The link expires in 30 minutes.",
  "auth.forgot.off":
    "This server does not send e-mail. Ask its administrator to run “pnpm reset-password” to reset your password.",
  "auth.reset.t": "Choose a new password",
  "auth.reset.password": "New password",
  "auth.reset.confirm": "Repeat the password",
  "auth.reset.mismatch": "The passwords do not match",
  "auth.reset.submit": "Save password",
  "auth.reset.done":
    "Password changed. All your sessions were signed out: sign in with the new one.",
  "auth.reset.invalid.t": "Invalid link",
  "auth.reset.invalid.d": "The link expired, was already used or is incomplete. Ask for a new one.",
  "auth.reset.again": "Ask for another link",
  "auth.backToLogin": "Back to sign in",
  "share.emailed": "e-mail sent",
  "api.auth.resetOff": "Password reset by e-mail is not enabled on this instance",
  "api.auth.resetInvalid": "The link is invalid or has expired",
};

const de: Record<keyof typeof es, string> = {
  "auth.forgot.link": "Passwort vergessen?",
  "auth.forgot.t": "Passwort zurücksetzen",
  "auth.forgot.d":
    "Gib die E-Mail deines Kontos ein und wir schicken dir einen Link, um ein neues Passwort zu wählen.",
  "auth.forgot.submit": "Link senden",
  "auth.forgot.sent":
    "Wenn es ein Konto mit dieser E-Mail gibt, ist eine Nachricht unterwegs. Der Link läuft in 30 Minuten ab.",
  "auth.forgot.off":
    "Dieser Server verschickt keine E-Mails. Bitte die Administration, „pnpm reset-password“ auszuführen, um dein Passwort zurückzusetzen.",
  "auth.reset.t": "Neues Passwort wählen",
  "auth.reset.password": "Neues Passwort",
  "auth.reset.confirm": "Passwort wiederholen",
  "auth.reset.mismatch": "Die Passwörter stimmen nicht überein",
  "auth.reset.submit": "Passwort speichern",
  "auth.reset.done":
    "Passwort geändert. Alle deine Sitzungen wurden abgemeldet: melde dich mit dem neuen an.",
  "auth.reset.invalid.t": "Ungültiger Link",
  "auth.reset.invalid.d":
    "Der Link ist abgelaufen, wurde schon benutzt oder ist unvollständig. Fordere einen neuen an.",
  "auth.reset.again": "Neuen Link anfordern",
  "auth.backToLogin": "Zurück zur Anmeldung",
  "share.emailed": "E-Mail gesendet",
  "api.auth.resetOff": "Das Zurücksetzen per E-Mail ist auf dieser Instanz nicht aktiviert",
  "api.auth.resetInvalid": "Der Link ist ungültig oder abgelaufen",
};

export const mailDict = { es, en, de };
