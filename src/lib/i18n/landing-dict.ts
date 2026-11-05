// Strings of the landing page, the register page's pitch and the first-run
// onboarding (empty project list). Merged into the main dictionaries last, so
// the `projects.*` overrides below win over the base copy. Add keys to `es`
// (the source of truth); `en` and `de` are typed against it, so a missing or
// extra key fails the typecheck.

const es = {
  // landing: nav + hero (the shout: Folio, unlike Prism, never closes)
  "landing.nav": "Navegación",
  "landing.hero.l1": "Folio",
  "landing.hero.l2": "no cierra.",
  "landing.hero.scrap-alt": "Una página del PDF compilado del proyecto demo.",
  "landing.hero.cat": "El editor LaTeX autoalojado con IA.",
  "landing.hero.sub":
    "Folio es el espacio abierto para escribir artículos científicos con IA: tu modelo, tu servidor, citas que no se pueden inventar y cada cambio a la vista antes de aplicarlo.",
  "landing.ai.h": "Escribe con IA. O sin ella.",
  "landing.ai.p":
    "Describe la sección y Folio busca literatura real, la muestra como evidencia y redacta el LaTeX: solo cita claves de tu .bib y nada se aplica sin tu confirmación. Sin proveedor configurado, todo lo demás funciona igual.",
  "landing.ai.you": "Tú:",
  "landing.ai.instr": "Escribe un párrafo sobre atención eficiente.",
  "landing.ai.agent": "Folio:",
  "landing.ai.draft":
    "La atención recortó el coste de las secuencias largas \cite{vaswani2017attention}",
  "landing.window.h": "El producto",
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
  "landing.stages.h": "Cómo funciona",
  "landing.stages.p":
    "De la primera nota al PDF compilado sin salir de Folio: cuatro movimientos que ya están en la demo.",
  "landing.stage.1.d":
    "La fuente a la izquierda, el PDF compilado a la derecha. Pulsa Compilar o Ctrl+Enter.",
  "landing.stage.1.n": "Escribe",
  "landing.stage.1.alt": "Editor de Folio con el código LaTeX y el PDF compilado lado a lado.",
  "landing.stage.2.d": "Busca en OpenAlex y arXiv, pulsa Citar, y la entrada llega a tu .bib.",
  "landing.stage.2.n": "Cita",
  "landing.stage.2.alt": "Biblioteca de Folio con las referencias del .bib y su estado.",
  "landing.stage.3.d":
    "Trabajo previo y derivado de cualquier paper, con tu propia bibliografía como semilla.",
  "landing.stage.3.n": "Explora",
  "landing.stage.3.alt": "Explorador de grafo de citas de Folio con la lista, el grafo y la ficha.",
  "landing.stage.4.d": "Postgres, el compilador y la app en un solo archivo compose.",
  "landing.stage.4.n": "Aloja",

  // landing: close (one word is the button) + footer
  "landing.close.p":
    "Crea tu cuenta y Folio abre un proyecto demo que ya compila: pulsa el PDF, cita un paper, guarda una versión.",
  "landing.cta.word": "Pruébalo",
  "landing.foot.note": "Autoalojado: tus artículos se quedan en tu propio Postgres.",
  "landing.foot.note2": "Interfaz en español, English y Deutsch.",
  "landing.foot.top": "Volver arriba",
  "landing.foot.col.self": "Autoalojado",
  "landing.foot.col.code": "Código",
  "landing.foot.col.credit": "Créditos",
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
  "landing.hero.l1": "Folio",
  "landing.hero.l2": "can't close.",
  "landing.hero.scrap-alt": "A page from the compiled PDF of the demo project.",
  "landing.hero.cat": "The self-hosted LaTeX editor with AI.",
  "landing.hero.sub":
    "Folio is the open workspace for writing scientific papers with AI: your model, your server, citations that cannot be invented, and every change in view before it lands.",
  "landing.ai.h": "Write with AI. Or without it.",
  "landing.ai.p":
    "Describe the section and Folio retrieves real literature, shows it as evidence and drafts the LaTeX: it only cites keys from your .bib and nothing is applied without your confirmation. With no provider configured, everything else works the same.",
  "landing.ai.you": "You:",
  "landing.ai.instr": "Draft a paragraph on efficient attention.",
  "landing.ai.agent": "Folio:",
  "landing.ai.draft": "Attention cut the cost of long sequences \cite{vaswani2017attention}",
  "landing.window.h": "The product",
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

  "landing.stages.h": "How it works",
  "landing.stages.p":
    "From the first note to the compiled PDF without leaving Folio: four moves already in the demo.",
  "landing.stage.1.d":
    "Source on the left, the compiled PDF on the right. Press Compile or Ctrl+Enter.",
  "landing.stage.1.n": "Write",
  "landing.stage.1.alt": "Folio editor with LaTeX source and the compiled PDF side by side.",
  "landing.stage.2.d": "Search OpenAlex and arXiv, press Cite, and the entry lands in your .bib.",
  "landing.stage.2.n": "Cite",
  "landing.stage.2.alt": "Folio library listing the references in the .bib and their status.",
  "landing.stage.3.d":
    "Prior and derivative work of any paper, with your own bibliography as the seed.",
  "landing.stage.3.n": "Explore",
  "landing.stage.3.alt":
    "Folio citation graph explorer with the list, the graph and the paper card.",
  "landing.stage.4.d": "Postgres, the compiler and the app in a single compose file.",
  "landing.stage.4.n": "Host",

  "landing.close.p":
    "Create your account and Folio opens a demo project that already compiles: click the PDF, cite a paper, save a version.",
  "landing.cta.word": "Try it",
  "landing.foot.note": "Self-hosted: your papers stay in your own Postgres.",
  "landing.foot.note2": "Interface in English, Español and Deutsch.",
  "landing.foot.top": "Back to top",
  "landing.foot.col.self": "Self-hosted",
  "landing.foot.col.code": "Code",
  "landing.foot.col.credit": "Credits",
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
  "landing.hero.l1": "Folio",
  "landing.hero.l2": "schließt nie.",
  "landing.hero.scrap-alt": "Eine Seite des kompilierten PDFs aus dem Demo-Projekt.",
  "landing.hero.cat": "Der selbst gehostete LaTeX-Editor mit KI.",
  "landing.hero.sub":
    "Folio ist der offene Arbeitsplatz für wissenschaftliches Schreiben mit KI: dein Modell, dein Server, Zitate, die sich nicht erfinden lassen, und jede Änderung sichtbar, bevor sie übernommen wird.",
  "landing.ai.h": "Mit KI schreiben. Oder ohne.",
  "landing.ai.p":
    "Beschreibe den Abschnitt, und Folio holt echte Literatur, zeigt sie als Belege und entwirft das LaTeX: zitiert werden nur Schlüssel aus deiner .bib, und nichts wird ohne deine Bestätigung übernommen. Ohne konfigurierten Anbieter funktioniert alles andere genauso.",
  "landing.ai.you": "Du:",
  "landing.ai.instr": "Entwirf einen Absatz über effiziente Attention.",
  "landing.ai.agent": "Folio:",
  "landing.ai.draft": "Attention senkte die Kosten langer Sequenzen \cite{vaswani2017attention}",
  "landing.window.h": "Das Produkt",
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

  "landing.stages.h": "So funktioniert es",
  "landing.stages.p":
    "Von der ersten Notiz zum kompilierten PDF, ohne Folio zu verlassen: vier Schritte, die schon in der Demo stecken.",
  "landing.stage.1.d":
    "Quelltext links, kompiliertes PDF rechts. Klicke auf Kompilieren oder drücke Strg+Enter.",
  "landing.stage.1.n": "Schreiben",
  "landing.stage.1.alt": "Folio-Editor mit LaTeX-Quelltext und kompiliertem PDF nebeneinander.",
  "landing.stage.2.d":
    "Suche in OpenAlex und arXiv, klicke auf Zitieren, und der Eintrag landet in deinem .bib.",
  "landing.stage.2.n": "Zitieren",
  "landing.stage.2.alt": "Folio-Bibliothek mit den Referenzen des .bib und ihrem Status.",
  "landing.stage.3.d":
    "Vorarbeiten und Folgearbeiten jeder Arbeit, mit deiner eigenen Bibliografie als Ausgangspunkt.",
  "landing.stage.3.n": "Erkunden",
  "landing.stage.3.alt": "Zitiergraph-Explorer von Folio mit Liste, Graph und Karte.",
  "landing.stage.4.d": "Postgres, Compiler und App in einer einzigen Compose-Datei.",
  "landing.stage.4.n": "Hosten",

  "landing.close.p":
    "Erstelle dein Konto und Folio öffnet ein Demo-Projekt, das schon kompiliert: ins PDF klicken, eine Arbeit zitieren, eine Version speichern.",
  "landing.cta.word": "Testen",
  "landing.foot.note": "Selbst gehostet: Deine Arbeiten bleiben in deinem eigenen Postgres.",
  "landing.foot.note2": "Oberfläche auf Español, English und Deutsch.",
  "landing.foot.top": "Nach oben",
  "landing.foot.col.self": "Selbst gehostet",
  "landing.foot.col.code": "Code",
  "landing.foot.col.credit": "Credits",
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
