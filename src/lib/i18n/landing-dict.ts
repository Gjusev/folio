// Strings of the landing page, the register page's pitch and the first-run
// onboarding (empty project list). Merged into the main dictionaries last, so
// the `projects.*` overrides below win over the base copy. Add keys to `es`
// (the source of truth); `en` and `de` are typed against it, so a missing or
// extra key fails the typecheck.

const es = {
  // landing: nav + hero (the shout: Folio, unlike Prism, never closes)
  "landing.nav": "Navegación",
  "landing.skip": "Saltar al contenido",
  "landing.nav.self": "Instalar",
  "landing.hero.pill": "Código abierto · Autoalojado · Apache-2.0",
  "landing.hero.h": "El editor LaTeX que puedes *auditar.*",
  "landing.hero.prism": "Folio importa su exportación tal cual.",
  "landing.hero.alt":
    "Folio compila el artículo en un contenedor aislado y el PDF aparece junto a la fuente.",
  "landing.film.btn": "Ver la película",
  "landing.film.title": "Folio en 57 segundos",
  "landing.film.close": "Cerrar",
  "landing.ch.label": "Del asistente a la publicación",
  "landing.ch.lit.k": "Literatura",
  "landing.ch.lit.h": "Busca artículos reales *sin salir* del editor.",
  "landing.ch.lit.p":
    "OpenAlex, arXiv, PubMed y Semantic Scholar en un solo buscador. Pulsa Citar y la entrada llega a tu .bib, lista para \\cite.",
  "landing.ch.lit.alt":
    "Búsqueda de artículos en Folio: resultados de OpenAlex, Citar y la bibliografía del proyecto.",
  "landing.turn.k": "Redacción",
  "landing.turn.h": "De la literatura a un borrador *citado.*",
  "landing.turn.1": "Tu bibliografía como grafo: en la demo, 93 artículos y 239 enlaces.",
  "landing.turn.2":
    "Pides una sección y el agente reúne evidencia antes de escribir: aquí, doce artículos.",
  "landing.turn.3": "Solo cita claves de tu .bib. Lo que invente se elimina en el servidor.",
  "landing.turn.alt":
    "Los artículos del grafo de citas se convierten en las líneas de un borrador con citas.",
  "landing.ch.asst.k": "Asistente",
  "landing.ch.asst.h": "Se ha leído el artículo *entero.*",
  "landing.ch.asst.p":
    "Pregunta por tu documento y responde con tu propia fuente delante. Nada cambia sin tu confirmación.",
  "landing.ch.asst.alt":
    "El asistente responde a una pregunta sobre la introducción señalando el método del artículo.",
  "landing.ch.rev.k": "Revisión",
  "landing.ch.rev.h": "Un revisor que *te cita.*",
  "landing.ch.rev.p":
    "Puntuación por aspecto y comentarios que señalan una línea de main.tex. Un clic y el asistente se encarga del arreglo.",
  "landing.ch.rev.alt":
    "Revisión con resumen, puntuaciones y un comentario mayor que cita main.tex:28.",
  "landing.ch.fix.k": "Errores",
  "landing.ch.fix.h": "Los errores salen como *parches.*",
  "landing.ch.fix.p":
    "Una compilación fallida vuelve como un parche en rojo y verde. Lo aplicas y Folio recompila.",
  "landing.ch.fix.alt":
    "Error de compilación en main.tex:12, el parche propuesto y el PDF recompilado.",
  "landing.ch.ship.k": "En equipo",
  "landing.ch.ship.h": "Escribe en equipo. Publica *donde quieras.*",
  "landing.ch.ship.p":
    "Invita a coautores, guarda versiones que comparas con latexdiff y exporta el PDF, las fuentes o un paquete para arXiv.",
  "landing.ch.ship.alt": "Menús de compartir, exportar y versiones de Folio.",
  "landing.model.h": "Tu servidor. Tu *modelo.*",
  "landing.model.p":
    "Cualquier API compatible con OpenAI, Anthropic o un modelo local, con un proveedor distinto por tarea. Las claves se guardan cifradas en tu servidor.",
  "landing.model.alt": "Ajustes de Folio: proveedores de IA y reparto por tarea.",
  "landing.self.h": "Tres comandos y es tuyo.",
  "landing.self.p":
    "Postgres, el compilador y la app en un solo archivo compose. Sin seguimiento y sin correo de verificación.",
  "landing.self.repo": "Guía de instalación",
  "landing.close.h": "Tu próximo artículo, en *tu* servidor.",
  "landing.hero.sub":
    "Folio es el espacio abierto para escribir artículos científicos con IA: tu modelo, tu servidor, citas que no se pueden inventar y cada cambio a la vista antes de aplicarlo.",
  "landing.cta.main": "Probar el proyecto demo",
  "landing.cta.more": "Ver qué incluye",
  "landing.cta.selfhost": "Instálalo en tu servidor",
  // landing: Prism clock
  "landing.prism.h": "Prism cierra en {n:día|días}.",
  "landing.prism.closed": "Prism ya ha cerrado.",
  "landing.prism.until": "hasta el 1 de enero de 2027",
  "landing.prism.body":
    "Folio importa la exportación de Prism tal cual. Desde ahí, tus artículos viven en tu propio Postgres, no en el calendario de otro.",
  "landing.prism.step1": "En Prism: Settings → Data Controls → Export all.",
  "landing.prism.step2": "Crea tu cuenta en Folio.",
  "landing.prism.step3": "Importa el ZIP en Proyectos: Folio detecta el archivo principal.",
  // landing: the films (real clips; captions describe the feature, never "real capture")
  // landing: capabilities (poster list: capability name + one-sentence description)
  "landing.feat.title": "Qué hay dentro",
  "landing.cap.1.s": "Escribe con IA",
  "landing.cap.1.d":
    "Redacta secciones con literatura real como evidencia, reescribe un párrafo viendo el diff y convierte la foto de una pizarra en LaTeX.",
  "landing.cap.2.s": "Citas que existen",
  "landing.cap.2.d":
    "Las claves inventadas se eliminan en el servidor, los borradores se comprueban compilando y ninguna edición se aplica sin que veas el diff.",
  "landing.cap.3.s": "Grafo de citas",
  "landing.cap.3.d":
    "Un grafo de citas al estilo Connected Papers, construido desde tu bibliografía con datos abiertos de OpenAlex.",
  "landing.cap.4.s": "Compila sin TeX",
  "landing.cap.4.d":
    "latexmk en un contenedor sin Internet, SyncTeX en ambos sentidos y versiones con las marcas de latexdiff.",
  "landing.cap.5.s": "Tu servidor",
  "landing.cap.5.d":
    "Cualquier API compatible con OpenAI, Anthropic o modelos locales. El propietario decide si un manuscrito puede salir del servidor, y Folio redacta la declaración de uso de IA que piden las revistas.",
  // landing: the name

  // landing: how it works (tinted accordion) + the demo library as a board

  // landing: close (one word is the button) + footer
  "landing.close.p":
    "Crea tu cuenta y Folio abre un proyecto demo que ya compila: pulsa el PDF, cita un paper, guarda una versión.",
  "landing.foot.note": "Autoalojado: tus artículos se quedan en tu propio Postgres.",
  "landing.foot.note2": "Interfaz en español, English y Deutsch.",
  "landing.foot.top": "Volver arriba",
  "landing.foot.col.code": "Código",
  "landing.foot.source": "Código fuente",
  "landing.foot.legal": "© 2026 Folio. Publicado bajo Apache-2.0.",

  // register page pitch
  "auth.register.lead": "Tu primer artículo compilando en un minuto.",
  "auth.register.b1.t": "Escribe con IA que puedes auditar",
  "auth.register.b1.d":
    "Redacta, reescribe y arregla errores con tu propio modelo; cada cambio llega como un diff que aplicas tú.",
  "auth.register.b2.t": "Cita sin salir del editor",
  "auth.register.b2.d": "Busca en OpenAlex y arXiv, pulsa Citar y la entrada llega a tu .bib.",
  "auth.register.b3.t": "Tus datos, tu servidor",
  "auth.register.b3.d":
    "Sin seguimiento ni correo de verificación: todo vive en tu propio Postgres.",
  "auth.password.show": "Mostrar",
  "auth.password.hide": "Ocultar",
  "auth.password.ok": "Longitud correcta (mínimo 10)",
  "auth.demo.opt": "Empezar con el proyecto demo",
  "auth.demo.opt.d": "Un artículo terminado que compila, para probar Folio en dos minutos.",
  "auth.privacy": "Tus datos no salen de este servidor.",
  "auth.closed.t": "El registro está cerrado en esta instancia",
  "auth.closed.d":
    "Este servidor no acepta cuentas nuevas. Folio es autoalojado: puedes levantar tu propia instancia en tres comandos.",
  // onboarding (empty project list)
  "onb.welcome": "Te damos la bienvenida, {name}",
  "onb.welcome.sub": "Elige cómo empezar. Siempre puedes cambiar de rumbo.",
  "onb.demo.t": "Explorar con el proyecto demo",
  "onb.demo.d":
    "Un artículo terminado que compila. Haz clic en el PDF, cita un artículo, guarda una versión.",
  "onb.demo.cta": "Cargar proyecto demo",
  "onb.demo.busy": "Preparando la demo…",
  "onb.tpl.t": "Empezar desde cero",
  "onb.tpl.d": "Plantillas de artículo, IEEE, tesis y más.",
  "onb.import.t": "Trae lo que ya tienes",
  "onb.import.d": "Importa un ZIP de Overleaf, arXiv o Prism; Folio detecta el archivo principal.",
  "projects.demo": "Proyecto demo",
  // first-run: empty project list (overrides of base copy at the bottom)
  "projects.empty.hint":
    "Empieza con el proyecto demo, una plantilla o el ZIP de Prism u Overleaf.",
  "projects.import.prism":
    "El importador acepta tal cual el ZIP de Prism (Settings → Data Controls → Export all), los proyectos de Overleaf y las fuentes de arXiv; detecta el archivo principal y descarta lo que no compila.",
  "projects.empty.tpl": "Elegir plantilla",
} as const;

const en: Record<keyof typeof es, string> = {
  "landing.nav": "Navigation",
  "landing.skip": "Skip to content",
  "landing.nav.self": "Self-host",
  "landing.hero.pill": "Open source · Self-hosted · Apache-2.0",
  "landing.hero.h": "The LaTeX editor you can *audit.*",
  "landing.hero.prism": "Folio imports its export as it is.",
  "landing.hero.alt":
    "Folio compiles the paper in an isolated container and the PDF appears beside the source.",
  "landing.film.btn": "Watch the film",
  "landing.film.title": "Folio in 57 seconds",
  "landing.film.close": "Close",
  "landing.ch.label": "From the assistant to publication",
  "landing.ch.lit.k": "Literature",
  "landing.ch.lit.h": "Search real papers, *inside* the editor.",
  "landing.ch.lit.p":
    "OpenAlex, arXiv, PubMed and Semantic Scholar in one search box. Press Cite and the entry lands in your .bib, ready for \\cite.",
  "landing.ch.lit.alt":
    "Paper search in Folio: OpenAlex results, Cite, and the project bibliography.",
  "landing.turn.k": "Drafting",
  "landing.turn.h": "From literature to a *cited* draft.",
  "landing.turn.1": "Your bibliography as a graph: in the demo, 93 papers and 239 links.",
  "landing.turn.2":
    "Ask for a section and the agent gathers evidence before it writes: twelve papers here.",
  "landing.turn.3":
    "It only cites keys from your .bib. Anything it invents is stripped on the server.",
  "landing.turn.alt": "The papers of the citation graph turn into the lines of a cited draft.",
  "landing.ch.asst.k": "Assistant",
  "landing.ch.asst.h": "It has read the *whole* paper.",
  "landing.ch.asst.p":
    "Ask about your document and it answers with your own source in view. Nothing changes until you confirm.",
  "landing.ch.asst.alt":
    "The assistant answers a question about the introduction, pointing at the paper's method.",
  "landing.ch.rev.k": "Review",
  "landing.ch.rev.h": "A reviewer that *quotes* you.",
  "landing.ch.rev.p":
    "Scores per aspect and comments that point to a line of main.tex. One click hands the fix to the assistant.",
  "landing.ch.rev.alt": "A review with a summary, scores and a major comment quoting main.tex:28.",
  "landing.ch.fix.k": "Errors",
  "landing.ch.fix.h": "Errors leave as *patches.*",
  "landing.ch.fix.p":
    "A failed compile comes back as a red and green patch. Apply it and Folio recompiles.",
  "landing.ch.fix.alt":
    "A compile error at main.tex:12, the proposed patch and the recompiled PDF.",
  "landing.ch.ship.k": "Together",
  "landing.ch.ship.h": "Write together. Ship *anywhere.*",
  "landing.ch.ship.p":
    "Invite co-authors, save versions you can compare with latexdiff, and export the PDF, the sources or an arXiv package.",
  "landing.ch.ship.alt": "Folio's share, export and versions menus.",
  "landing.model.h": "Your server. Your *model.*",
  "landing.model.p":
    "Any OpenAI-compatible API, Anthropic or a local model, with a different provider per task. Keys are stored encrypted on your server.",
  "landing.model.alt": "Folio settings: AI providers and per-task routing.",
  "landing.self.h": "Three commands and it's yours.",
  "landing.self.p":
    "Postgres, the compiler and the app in one compose file. No tracking and no verification email.",
  "landing.self.repo": "Installation guide",
  "landing.close.h": "Your next paper, on *your* server.",
  "landing.hero.sub":
    "Folio is the open workspace for writing scientific papers with AI: your model, your server, citations that cannot be invented, and every change in view before it lands.",
  "landing.cta.main": "Try the demo project",
  "landing.cta.more": "See what is inside",
  "landing.cta.selfhost": "Run it on your server",
  "landing.prism.h": "Prism closes in {n:day|days}.",
  "landing.prism.closed": "Prism has closed.",
  "landing.prism.until": "until 1 January 2027",
  "landing.prism.body":
    "Folio imports the Prism export as it is. From then on your papers live in your own Postgres, not on someone else's schedule.",
  "landing.prism.step1": "In Prism: Settings → Data Controls → Export all.",
  "landing.prism.step2": "Create your Folio account.",
  "landing.prism.step3": "Import the ZIP in Projects: Folio finds the main file.",
  "landing.feat.title": "What is inside",
  "landing.cap.1.s": "Write with AI",
  "landing.cap.1.d":
    "Draft sections with real literature as evidence, rewrite a paragraph with the diff in view, and turn a whiteboard photo into LaTeX.",
  "landing.cap.2.s": "Citations that exist",
  "landing.cap.2.d":
    "Invented keys are removed on the server, drafts are checked by compiling, and no edit lands until you have seen its diff.",
  "landing.cap.3.s": "Citation graph",
  "landing.cap.3.d":
    "A citation graph in the style of Connected Papers, built from your bibliography with open OpenAlex data.",
  "landing.cap.4.s": "Compile without TeX",
  "landing.cap.4.d":
    "latexmk in a container with no Internet, SyncTeX both ways, and versions with latexdiff markup.",
  "landing.cap.5.s": "Your server",
  "landing.cap.5.d":
    "Any OpenAI-compatible API, Anthropic or local models. The owner decides whether a manuscript may leave the server, and Folio writes the AI-use declaration journals ask for.",

  "landing.close.p":
    "Create your account and Folio opens a demo project that already compiles: click the PDF, cite a paper, save a version.",
  "landing.foot.note": "Self-hosted: your papers stay in your own Postgres.",
  "landing.foot.note2": "Interface in English, Español and Deutsch.",
  "landing.foot.top": "Back to top",
  "landing.foot.col.code": "Code",
  "landing.foot.source": "Source code",
  "landing.foot.legal": "© 2026 Folio. Released under Apache-2.0.",

  "auth.register.lead": "Your first paper, compiling in a minute.",
  "auth.register.b1.t": "Write with AI you can audit",
  "auth.register.b1.d":
    "Draft, rewrite and fix errors with your own model; every change arrives as a diff you apply.",
  "auth.register.b2.t": "Cite without leaving the editor",
  "auth.register.b2.d": "Search OpenAlex and arXiv, press Cite, and the entry lands in your .bib.",
  "auth.register.b3.t": "Your data, your server",
  "auth.register.b3.d":
    "No tracking and no verification e-mail: everything lives in your own Postgres.",
  "auth.password.show": "Show",
  "auth.password.hide": "Hide",
  "auth.password.ok": "Length OK (10 or more)",
  "auth.demo.opt": "Start with the demo project",
  "auth.demo.opt.d": "A finished paper that compiles, to try Folio in two minutes.",
  "auth.privacy": "Your data does not leave this server.",
  "auth.closed.t": "Registration is closed on this instance",
  "auth.closed.d":
    "This server accepts no new accounts. Folio is self-hosted: you can run your own in three commands.",
  "onb.welcome": "Welcome, {name}",
  "onb.welcome.sub": "Choose how to start. You can always change course.",
  "onb.demo.t": "Explore with the demo project",
  "onb.demo.d": "A finished paper that compiles. Click the PDF, cite a paper, save a version.",
  "onb.demo.cta": "Load demo project",
  "onb.demo.busy": "Preparing the demo…",
  "onb.tpl.t": "Start from scratch",
  "onb.tpl.d": "Templates for articles, IEEE, theses and more.",
  "onb.import.t": "Bring what you have",
  "onb.import.d": "Import a ZIP from Overleaf, arXiv or Prism; Folio finds the main file.",
  "projects.demo": "Demo project",
  "projects.empty.hint": "Start with the demo project, a template, or the Prism or Overleaf ZIP.",
  "projects.import.prism":
    "The importer takes the Prism ZIP (Settings → Data Controls → Export all), Overleaf projects and arXiv sources as-is; it detects the main file and drops what does not compile.",
  "projects.empty.tpl": "Choose a template",
};

const de: Record<keyof typeof es, string> = {
  "landing.nav": "Navigation",
  "landing.skip": "Zum Inhalt springen",
  "landing.nav.self": "Selbst hosten",
  "landing.hero.pill": "Open Source · Selbst gehostet · Apache-2.0",
  "landing.hero.h": "Der LaTeX-Editor, den du *prüfst.*",
  "landing.hero.prism": "Folio importiert den Export unverändert.",
  "landing.hero.alt":
    "Folio kompiliert den Artikel in einem isolierten Container, und das PDF erscheint neben dem Quelltext.",
  "landing.film.btn": "Film ansehen",
  "landing.film.title": "Folio in 57 Sekunden",
  "landing.film.close": "Schließen",
  "landing.ch.label": "Vom Assistenten zur Veröffentlichung",
  "landing.ch.lit.k": "Literatur",
  "landing.ch.lit.h": "Echte Paper suchen, *direkt* im Editor.",
  "landing.ch.lit.p":
    "OpenAlex, arXiv, PubMed und Semantic Scholar in einem Suchfeld. Ein Klick auf Zitieren, und der Eintrag steht in deinem .bib, bereit für \\cite.",
  "landing.ch.lit.alt":
    "Paper-Suche in Folio: OpenAlex-Ergebnisse, Zitieren und die Projektbibliografie.",
  "landing.turn.k": "Entwurf",
  "landing.turn.h": "Von der Literatur zum *zitierten* Entwurf.",
  "landing.turn.1": "Deine Bibliografie als Graph: in der Demo 93 Paper und 239 Verbindungen.",
  "landing.turn.2":
    "Du bittest um einen Abschnitt, und der Agent sammelt zuerst Belege: hier zwölf Paper.",
  "landing.turn.3":
    "Er zitiert nur Schlüssel aus deinem .bib. Was er erfindet, entfernt der Server.",
  "landing.turn.alt": "Die Paper des Zitiergraphen werden zu den Zeilen eines zitierten Entwurfs.",
  "landing.ch.asst.k": "Assistent",
  "landing.ch.asst.h": "Er hat das *ganze* Paper gelesen.",
  "landing.ch.asst.p":
    "Frag nach deinem Dokument, und er antwortet mit deinem Quelltext vor Augen. Nichts ändert sich ohne deine Bestätigung.",
  "landing.ch.asst.alt":
    "Der Assistent beantwortet eine Frage zur Einleitung und verweist auf die Methode des Papers.",
  "landing.ch.rev.k": "Review",
  "landing.ch.rev.h": "Ein Reviewer, der dich *zitiert.*",
  "landing.ch.rev.p":
    "Bewertungen pro Aspekt und Kommentare, die auf eine Zeile in main.tex zeigen. Ein Klick übergibt die Korrektur an den Assistenten.",
  "landing.ch.rev.alt":
    "Ein Review mit Zusammenfassung, Bewertungen und einem Hauptkommentar, der main.tex:28 zitiert.",
  "landing.ch.fix.k": "Fehler",
  "landing.ch.fix.h": "Fehler kommen als *Patch* zurück.",
  "landing.ch.fix.p":
    "Ein fehlgeschlagener Lauf kommt als roter und grüner Patch zurück. Du wendest ihn an, Folio kompiliert neu.",
  "landing.ch.fix.alt":
    "Ein Kompilierfehler in main.tex:12, der vorgeschlagene Patch und das neu kompilierte PDF.",
  "landing.ch.ship.k": "Gemeinsam",
  "landing.ch.ship.h": "Gemeinsam schreiben. *Überall* publizieren.",
  "landing.ch.ship.p":
    "Lade Co-Autoren ein, speichere Versionen, die du mit latexdiff vergleichst, und exportiere PDF, Quellen oder ein arXiv-Paket.",
  "landing.ch.ship.alt": "Die Menüs Teilen, Exportieren und Versionen in Folio.",
  "landing.model.h": "Dein Server. Dein *Modell.*",
  "landing.model.p":
    "Jede OpenAI-kompatible API, Anthropic oder ein lokales Modell, mit einem eigenen Anbieter pro Aufgabe. Schlüssel liegen verschlüsselt auf deinem Server.",
  "landing.model.alt": "Folio-Einstellungen: KI-Anbieter und Zuordnung pro Aufgabe.",
  "landing.self.h": "Drei Befehle, und es gehört dir.",
  "landing.self.p":
    "Postgres, Compiler und App in einer Compose-Datei. Kein Tracking, keine Bestätigungsmail.",
  "landing.self.repo": "Installationsanleitung",
  "landing.close.h": "Dein nächstes Paper, auf *deinem* Server.",
  "landing.hero.sub":
    "Folio ist der offene Arbeitsplatz für wissenschaftliches Schreiben mit KI: dein Modell, dein Server, Zitate, die sich nicht erfinden lassen, und jede Änderung sichtbar, bevor sie übernommen wird.",
  "landing.cta.main": "Demo-Projekt ausprobieren",
  "landing.cta.more": "Ansehen, was drinsteckt",
  "landing.cta.selfhost": "Auf deinem Server betreiben",
  "landing.prism.h": "Prism schließt in {n:Tag|Tagen}.",
  "landing.prism.closed": "Prism ist geschlossen.",
  "landing.prism.until": "bis zum 1. Januar 2027",
  "landing.prism.body":
    "Folio importiert den Prism-Export unverändert. Danach liegen deine Arbeiten in deinem eigenen Postgres, nicht im Zeitplan eines anderen.",
  "landing.prism.step1": "In Prism: Settings → Data Controls → Export all.",
  "landing.prism.step2": "Erstelle dein Folio-Konto.",
  "landing.prism.step3": "Importiere das ZIP unter Projekte: Folio findet die Hauptdatei.",
  "landing.feat.title": "Was drinsteckt",
  "landing.cap.1.s": "Mit KI schreiben",
  "landing.cap.1.d":
    "Entwirf Abschnitte mit echter Literatur als Beleg, formuliere einen Absatz mit sichtbarem Diff um und mach aus einem Whiteboard-Foto LaTeX.",
  "landing.cap.2.s": "Zitate, die existieren",
  "landing.cap.2.d":
    "Erfundene Schlüssel werden auf dem Server entfernt, Entwürfe durch Kompilieren geprüft, und keine Änderung wird übernommen, bevor du ihren Diff gesehen hast.",
  "landing.cap.3.s": "Zitiergraph",
  "landing.cap.3.d":
    "Ein Zitiergraph im Stil von Connected Papers, aus deiner Bibliografie mit offenen OpenAlex-Daten gebaut.",
  "landing.cap.4.s": "Kompilieren ohne TeX",
  "landing.cap.4.d":
    "latexmk in einem Container ohne Internet, SyncTeX in beide Richtungen und Versionen mit latexdiff-Markierungen.",
  "landing.cap.5.s": "Dein Server",
  "landing.cap.5.d":
    "Jede OpenAI-kompatible API, Anthropic oder lokale Modelle. Der Eigentümer entscheidet, ob ein Manuskript den Server verlassen darf, und Folio schreibt die KI-Erklärung, die Zeitschriften verlangen.",

  "landing.close.p":
    "Erstelle dein Konto und Folio öffnet ein Demo-Projekt, das schon kompiliert: ins PDF klicken, eine Arbeit zitieren, eine Version speichern.",
  "landing.foot.note": "Selbst gehostet: Deine Arbeiten bleiben in deinem eigenen Postgres.",
  "landing.foot.note2": "Oberfläche auf Español, English und Deutsch.",
  "landing.foot.top": "Nach oben",
  "landing.foot.col.code": "Code",
  "landing.foot.source": "Quellcode",
  "landing.foot.legal": "© 2026 Folio. Unter Apache-2.0 veröffentlicht.",

  "auth.register.lead": "Deine erste Arbeit, in einer Minute kompiliert.",
  "auth.register.b1.t": "Schreibe mit KI, die du prüfen kannst",
  "auth.register.b1.d":
    "Entwerfen, umformulieren und Fehler beheben mit deinem eigenen Modell; jede Änderung kommt als Diff, den du übernimmst.",
  "auth.register.b2.t": "Zitieren, ohne den Editor zu verlassen",
  "auth.register.b2.d":
    "Suche in OpenAlex und arXiv, klicke auf Zitieren, und der Eintrag landet in deinem .bib.",
  "auth.register.b3.t": "Deine Daten, dein Server",
  "auth.register.b3.d":
    "Kein Tracking und keine Bestätigungs-E-Mail: Alles liegt in deinem eigenen Postgres.",
  "auth.password.show": "Anzeigen",
  "auth.password.hide": "Verbergen",
  "auth.password.ok": "Länge passt (mindestens 10)",
  "auth.demo.opt": "Mit dem Demo-Projekt starten",
  "auth.demo.opt.d":
    "Eine fertige Arbeit, die kompiliert, um Folio in zwei Minuten auszuprobieren.",
  "auth.privacy": "Deine Daten verlassen diesen Server nicht.",
  "auth.closed.t": "Die Registrierung ist auf dieser Instanz geschlossen",
  "auth.closed.d":
    "Dieser Server nimmt keine neuen Konten an. Folio ist selbst gehostet: Du kannst deine eigene Instanz mit drei Befehlen betreiben.",
  "onb.welcome": "Willkommen, {name}",
  "onb.welcome.sub": "Wähle, wie du anfangen willst. Du kannst jederzeit umschwenken.",
  "onb.demo.t": "Mit dem Demo-Projekt erkunden",
  "onb.demo.d":
    "Eine fertige Arbeit, die kompiliert. Klicke ins PDF, zitiere eine Arbeit, speichere eine Version.",
  "onb.demo.cta": "Demo-Projekt laden",
  "onb.demo.busy": "Demo wird vorbereitet…",
  "onb.tpl.t": "Bei null anfangen",
  "onb.tpl.d": "Vorlagen für Artikel, IEEE, Abschlussarbeiten und mehr.",
  "onb.import.t": "Mitbringen, was du hast",
  "onb.import.d": "Importiere ein ZIP aus Overleaf, arXiv oder Prism; Folio findet die Hauptdatei.",
  "projects.demo": "Demo-Projekt",
  "projects.empty.hint":
    "Starte mit dem Demo-Projekt, einer Vorlage oder dem Prism- oder Overleaf-ZIP.",
  "projects.import.prism":
    "Der Importer nimmt das Prism-ZIP (Settings → Data Controls → Export all), Overleaf-Projekte und arXiv-Quellen unverändert; er erkennt die Hauptdatei und verwirft, was nicht kompiliert.",
  "projects.empty.tpl": "Vorlage wählen",
};

export const landingDict = { es, en, de };
