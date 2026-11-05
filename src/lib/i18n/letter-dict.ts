// Strings of the response-letter section (review panel). `es` is the source of
// truth; `en` and `de` are typed against it.

const es = {
  "letter.title": "Carta de respuesta",
  "letter.review": "Revisión de Folio",
  "letter.review.none": "Ninguna",
  "letter.review.current": "La que estoy viendo",
  "letter.pasted": "Comentarios pegados",
  "letter.pasted.ph":
    "Pega aquí los comentarios de los revisores («Reviewer 1», puntos «1.», «R1.2:»…)",
  "letter.snapshot": "Versión para el apéndice (opcional)",
  "letter.snapshot.none": "Ninguna",
  "letter.empty": "Sin ítems: elige una revisión o pega comentarios.",
  "letter.count": "{n:ítem|ítems}",
  "letter.response.ph": "Tu respuesta (vacío = pendiente)",
  "letter.drafts": "Borradores IA",
  "letter.drafts.busy": "Redactando…",
  "letter.create": "Crear y compilar carta",
  "letter.create.busy": "Creando…",
  "letter.created": "Carta creada: {path}",
  "letter.pages": "{n:página|páginas}",
  "letter.open": "Abrir en editor",
  "letter.aiBadge": "Borrador IA",
  "letter.failCreate": "No se pudo crear la carta",
  "letter.failCompile": "La carta se creó, pero la compilación falló (mira el log en el panel PDF)",
} as const;

const en: Record<keyof typeof es, string> = {
  "letter.title": "Response letter",
  "letter.review": "Folio review",
  "letter.review.none": "None",
  "letter.review.current": "The one I am viewing",
  "letter.pasted": "Pasted comments",
  "letter.pasted.ph": "Paste the reviewers' comments here (“Reviewer 1”, points “1.”, “R1.2:”…)",
  "letter.snapshot": "Version for the appendix (optional)",
  "letter.snapshot.none": "None",
  "letter.empty": "No items: pick a review or paste comments.",
  "letter.count": "{n:item|items}",
  "letter.response.ph": "Your response (empty = pending)",
  "letter.drafts": "AI drafts",
  "letter.drafts.busy": "Drafting…",
  "letter.create": "Create and compile letter",
  "letter.create.busy": "Creating…",
  "letter.created": "Letter created: {path}",
  "letter.pages": "{n:page|pages}",
  "letter.open": "Open in editor",
  "letter.aiBadge": "AI draft",
  "letter.failCreate": "The letter could not be created",
  "letter.failCompile":
    "The letter was created, but compilation failed (see the log in the PDF panel)",
};

const de: Record<keyof typeof es, string> = {
  "letter.title": "Antwortbrief",
  "letter.review": "Folio-Gutachten",
  "letter.review.none": "Keine",
  "letter.review.current": "Das aktuell angezeigte",
  "letter.pasted": "Eingefügte Kommentare",
  "letter.pasted.ph":
    "Füge hier die Kommentare der Gutachter ein („Reviewer 1“, Punkte „1.“, „R1.2:“…)",
  "letter.snapshot": "Version für den Anhang (optional)",
  "letter.snapshot.none": "Keine",
  "letter.empty": "Keine Punkte: Wähle ein Gutachten oder füge Kommentare ein.",
  "letter.count": "{n:Punkt|Punkte}",
  "letter.response.ph": "Deine Antwort (leer = offen)",
  "letter.drafts": "KI-Entwürfe",
  "letter.drafts.busy": "Entwürfe werden erstellt…",
  "letter.create": "Brief erstellen und kompilieren",
  "letter.create.busy": "Wird erstellt…",
  "letter.created": "Brief erstellt: {path}",
  "letter.pages": "{n:Seite|Seiten}",
  "letter.open": "Im Editor öffnen",
  "letter.aiBadge": "KI-Entwurf",
  "letter.failCreate": "Der Brief konnte nicht erstellt werden",
  "letter.failCompile":
    "Der Brief wurde erstellt, aber das Kompilieren schlug fehl (siehe Protokoll im PDF-Bereich)",
};

export const letterDict = { es, en, de };
