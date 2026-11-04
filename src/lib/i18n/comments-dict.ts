// Strings of the comments drawer and gutter markers. `es` is the source of
// truth; `en` and `de` are typed against it.

const es = {
  "cm.title": "Comentarios",
  "cm.onSelection": "Comentar la selección ({n})",
  "cm.empty":
    "Sin comentarios todavía. Selecciona texto en el editor y pulsa «Comentar la selección».",
  "cm.open": "Abiertos",
  "cm.resolved": "Resueltos",
  "cm.reply": "Responder",
  "cm.ph.reply": "Escribe una respuesta…",
  "cm.ph.new": "Escribe un comentario…",
  "cm.send": "Enviar",
  "cm.sending": "Enviando…",
  "cm.resolve": "Resolver",
  "cm.reopen": "Reabrir",
  "cm.delete": "Eliminar",
} as const;

const en: Record<keyof typeof es, string> = {
  "cm.title": "Comments",
  "cm.onSelection": "Comment on selection ({n})",
  "cm.empty": "No comments yet. Select text in the editor and press “Comment on selection”.",
  "cm.open": "Open",
  "cm.resolved": "Resolved",
  "cm.reply": "Reply",
  "cm.ph.reply": "Write a reply…",
  "cm.ph.new": "Write a comment…",
  "cm.send": "Send",
  "cm.sending": "Sending…",
  "cm.resolve": "Resolve",
  "cm.reopen": "Reopen",
  "cm.delete": "Delete",
};

const de: Record<keyof typeof es, string> = {
  "cm.title": "Kommentare",
  "cm.onSelection": "Auswahl kommentieren ({n})",
  "cm.empty": "Noch keine Kommentare. Wähle Text im Editor und klicke auf „Auswahl kommentieren“.",
  "cm.open": "Offen",
  "cm.resolved": "Erledigt",
  "cm.reply": "Antworten",
  "cm.ph.reply": "Antwort schreiben…",
  "cm.ph.new": "Kommentar schreiben…",
  "cm.send": "Senden",
  "cm.sending": "Wird gesendet…",
  "cm.resolve": "Erledigen",
  "cm.reopen": "Wieder öffnen",
  "cm.delete": "Löschen",
};

export const commentsDict = { es, en, de };
