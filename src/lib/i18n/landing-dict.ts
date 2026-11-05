// Strings of the landing page, the register page's pitch and the first-run
// onboarding (empty project list). Merged into the main dictionaries last, so
// the `projects.*` overrides below win over the base copy. Add keys to `es`
// (the source of truth); `en` and `de` are typed against it, so a missing or
// extra key fails the typecheck.

const es = {
  // landing: nav + hero (the sentence reads "Tu [página compilada] en tu servidor.")
  "landing.nav": "Navegación",
  "landing.hero.a": "Tu",
  "landing.hero.word": "artículo",
  "landing.hero.b": "en tu servidor.",
  "landing.hero.cat": "El editor LaTeX autoalojado con IA.",
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
  // landing: features (sentences with switches)
  "landing.feat.title": "Qué hay dentro",
  "landing.band.1.s": "Escribe con una IA que conoce todo tu artículo.",
  "landing.band.1.d":
    "Redacta secciones con literatura real como evidencia, reescribe un párrafo viendo el diff y convierte la foto de una pizarra en LaTeX.",
  "landing.band.2.s": "Cada cita existe. Cada cambio lo apruebas tú.",
  "landing.band.2.d":
    "Las claves inventadas se eliminan en el servidor, los borradores se comprueban compilando y ninguna edición se aplica sin que veas el diff.",
  "landing.band.3.s": "Ve cada paper que conecta tu .bib.",
  "landing.band.3.d":
    "Un grafo de citas al estilo Connected Papers, construido desde tu bibliografía con datos abiertos de OpenAlex.",
  "landing.band.4.s": "Compila sin instalar TeX.",
  "landing.band.4.d":
    "latexmk en un contenedor sin Internet, SyncTeX en ambos sentidos y versiones con las marcas de latexdiff.",
  "landing.band.5.s": "Tu modelo, tu clave, tu servidor.",
  "landing.band.5.d":
    "Cualquier API compatible con OpenAI, Anthropic o modelos locales. El propietario decide si un manuscrito puede salir del servidor, y Folio redacta la declaración de uso de IA que piden las revistas.",
  // landing: the name
  "landing.folio.h": "Un folio es una hoja plegada una vez.",
  "landing.folio.p":
    "Dos hojas, cuatro páginas: tu fuente a un lado, el resultado al otro. El libro más conocido de su clase es el Primer Folio de Shakespeare, de 1623. Este compila.",
  "landing.folio.alt": "Portada del Primer Folio de Shakespeare, 1623, con el retrato grabado.",
  "landing.folio.cap": "Portada del Primer Folio, 1623 (British Library).",
  // landing: stages
  "landing.stage.aria": "Fase",
  "landing.stage.1.c": "Escribe en el editor.",
  "landing.stage.1.d":
    "La fuente a la izquierda, el PDF compilado a la derecha. Pulsa Compilar o Ctrl+Enter.",
  "landing.stage.1.n": "Escribe",
  "landing.stage.1.alt": "Editor de Folio con el código LaTeX y el PDF compilado lado a lado.",
  "landing.stage.2.c": "Cita desde tu biblioteca.",
  "landing.stage.2.d": "Busca en OpenAlex y arXiv, pulsa Citar, y la entrada llega a tu .bib.",
  "landing.stage.2.n": "Cita",
  "landing.stage.2.alt": "Biblioteca de Folio con las referencias del .bib y su estado.",
  "landing.stage.3.c": "Explora el grafo.",
  "landing.stage.3.d":
    "Trabajo previo y derivado de cualquier paper, con tu propia bibliografía como semilla.",
  "landing.stage.3.n": "Explora",
  "landing.stage.3.alt": "Explorador de grafo de citas de Folio con la lista, el grafo y la ficha.",
  "landing.stage.4.c": "Ejecútalo en tu servidor.",
  "landing.stage.4.d": "Postgres, el compilador y la app en un solo archivo compose.",
  "landing.stage.4.n": "Aloja",
  "landing.stage.4.alt": "Los dos comandos para levantar Folio con Docker Compose.",
  // landing: close + footer
  "landing.close.h": "Pruébalo con un artículo terminado.",
  "landing.close.p":
    "Crea tu cuenta y Folio abre un proyecto demo que ya compila: pulsa el PDF, cita un paper, guarda una versión.",
  "landing.close.cta": "Crear cuenta y abrir la demo",
  "landing.foot.note": "Autoalojado: tus artículos se quedan en tu propio Postgres.",
  "landing.foot.note2": "Interfaz en español, English y Deutsch.",
  "landing.foot.top": "Volver arriba",
  "landing.foot.credit":
    "Imagen: portada del Primer Folio, British Library, CC0. Vídeo: «Printing in a letterpress», Subhashish Panigrahi, CC BY-SA 4.0. Vía Wikimedia Commons.",
  "landing.folio.reel": "Imprenta tipográfica en Cuttack, India.",
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
  "landing.hero.a": "Your",
  "landing.hero.word": "paper",
  "landing.hero.b": "on your server.",
  "landing.hero.cat": "The self-hosted LaTeX editor with AI.",
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
  "landing.band.1.s": "Write with an AI that knows your whole paper.",
  "landing.band.1.d":
    "Draft sections with real literature as evidence, rewrite a paragraph with the diff in view, and turn a whiteboard photo into LaTeX.",
  "landing.band.2.s": "Every citation exists. Every change is yours to approve.",
  "landing.band.2.d":
    "Invented keys are removed on the server, drafts are checked by compiling, and no edit lands until you have seen its diff.",
  "landing.band.3.s": "See every paper your .bib connects to.",
  "landing.band.3.d":
    "A citation graph in the style of Connected Papers, built from your bibliography with open OpenAlex data.",
  "landing.band.4.s": "Compile without installing TeX.",
  "landing.band.4.d":
    "latexmk in a container with no Internet, SyncTeX both ways, and versions with latexdiff markup.",
  "landing.band.5.s": "Your model, your key, your server.",
  "landing.band.5.d":
    "Any OpenAI-compatible API, Anthropic or local models. The owner decides whether a manuscript may leave the server, and Folio writes the AI-use declaration journals ask for.",
  "landing.folio.h": "A folio is a sheet folded once.",
  "landing.folio.p":
    "Two leaves, four pages: your source on one side, the result on the other. The best-known book of the kind is Shakespeare's First Folio of 1623. This one compiles.",
  "landing.folio.alt": "Title page of Shakespeare's First Folio, 1623, with the engraved portrait.",
  "landing.folio.cap": "Title page of the First Folio, 1623 (British Library).",
  "landing.stage.aria": "Stage",
  "landing.stage.1.c": "Write in the editor.",
  "landing.stage.1.d":
    "Source on the left, the compiled PDF on the right. Press Compile or Ctrl+Enter.",
  "landing.stage.1.n": "Write",
  "landing.stage.1.alt": "Folio editor with LaTeX source and the compiled PDF side by side.",
  "landing.stage.2.c": "Cite from your library.",
  "landing.stage.2.d": "Search OpenAlex and arXiv, press Cite, and the entry lands in your .bib.",
  "landing.stage.2.n": "Cite",
  "landing.stage.2.alt": "Folio library listing the references in the .bib and their status.",
  "landing.stage.3.c": "Explore the graph.",
  "landing.stage.3.d":
    "Prior and derivative work of any paper, with your own bibliography as the seed.",
  "landing.stage.3.n": "Explore",
  "landing.stage.3.alt":
    "Folio citation graph explorer with the list, the graph and the paper card.",
  "landing.stage.4.c": "Run it on your server.",
  "landing.stage.4.d": "Postgres, the compiler and the app in a single compose file.",
  "landing.stage.4.n": "Host",
  "landing.stage.4.alt": "The two commands that start Folio with Docker Compose.",
  "landing.close.h": "Try it with a finished paper.",
  "landing.close.p":
    "Create your account and Folio opens a demo project that already compiles: click the PDF, cite a paper, save a version.",
  "landing.close.cta": "Create account and open the demo",
  "landing.foot.note": "Self-hosted: your papers stay in your own Postgres.",
  "landing.foot.note2": "Interface in English, Español and Deutsch.",
  "landing.foot.top": "Back to top",
  "landing.foot.credit":
    'Image: First Folio title page, British Library, CC0. Video: "Printing in a letterpress", Subhashish Panigrahi, CC BY-SA 4.0. Via Wikimedia Commons.',
  "landing.folio.reel": "A letterpress at work in Cuttack, India.",
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
  "landing.hero.a": "Dein",
  "landing.hero.word": "Paper",
  "landing.hero.b": "auf deinem Server.",
  "landing.hero.cat": "Der selbst gehostete LaTeX-Editor mit KI.",
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
  "landing.band.1.s": "Schreibe mit einer KI, die dein ganzes Paper kennt.",
  "landing.band.1.d":
    "Entwirf Abschnitte mit echter Literatur als Beleg, formuliere einen Absatz mit sichtbarem Diff um und mach aus einem Whiteboard-Foto LaTeX.",
  "landing.band.2.s": "Jedes Zitat existiert. Jede Änderung bestätigst du.",
  "landing.band.2.d":
    "Erfundene Schlüssel werden auf dem Server entfernt, Entwürfe durch Kompilieren geprüft, und keine Änderung wird übernommen, bevor du ihren Diff gesehen hast.",
  "landing.band.3.s": "Sieh jede Arbeit, die dein .bib verbindet.",
  "landing.band.3.d":
    "Ein Zitiergraph im Stil von Connected Papers, aus deiner Bibliografie mit offenen OpenAlex-Daten gebaut.",
  "landing.band.4.s": "Kompilieren ohne TeX-Installation.",
  "landing.band.4.d":
    "latexmk in einem Container ohne Internet, SyncTeX in beide Richtungen und Versionen mit latexdiff-Markierungen.",
  "landing.band.5.s": "Dein Modell, dein Schlüssel, dein Server.",
  "landing.band.5.d":
    "Jede OpenAI-kompatible API, Anthropic oder lokale Modelle. Der Eigentümer entscheidet, ob ein Manuskript den Server verlassen darf, und Folio schreibt die KI-Erklärung, die Zeitschriften verlangen.",
  "landing.folio.h": "Ein Folio ist ein einmal gefaltetes Blatt.",
  "landing.folio.p":
    "Zwei Blätter, vier Seiten: der Quelltext auf der einen Seite, das Ergebnis auf der anderen. Das bekannteste Buch dieser Art ist Shakespeares First Folio von 1623. Dieses hier kompiliert.",
  "landing.folio.alt":
    "Titelblatt von Shakespeares First Folio, 1623, mit dem gestochenen Porträt.",
  "landing.folio.cap": "Titelblatt des First Folio, 1623 (British Library).",
  "landing.stage.aria": "Phase",
  "landing.stage.1.c": "Schreib im Editor.",
  "landing.stage.1.d":
    "Quelltext links, kompiliertes PDF rechts. Klicke auf Kompilieren oder drücke Strg+Enter.",
  "landing.stage.1.n": "Schreiben",
  "landing.stage.1.alt": "Folio-Editor mit LaTeX-Quelltext und kompiliertem PDF nebeneinander.",
  "landing.stage.2.c": "Zitiere aus deiner Bibliothek.",
  "landing.stage.2.d":
    "Suche in OpenAlex und arXiv, klicke auf Zitieren, und der Eintrag landet in deinem .bib.",
  "landing.stage.2.n": "Zitieren",
  "landing.stage.2.alt": "Folio-Bibliothek mit den Referenzen des .bib und ihrem Status.",
  "landing.stage.3.c": "Erkunde den Graph.",
  "landing.stage.3.d":
    "Vorarbeiten und Folgearbeiten jeder Arbeit, mit deiner eigenen Bibliografie als Ausgangspunkt.",
  "landing.stage.3.n": "Erkunden",
  "landing.stage.3.alt": "Zitiergraph-Explorer von Folio mit Liste, Graph und Karte.",
  "landing.stage.4.c": "Betreib es auf deinem Server.",
  "landing.stage.4.d": "Postgres, Compiler und App in einer einzigen Compose-Datei.",
  "landing.stage.4.n": "Hosten",
  "landing.stage.4.alt": "Die zwei Befehle, die Folio mit Docker Compose starten.",
  "landing.close.h": "Probier es mit einer fertigen Arbeit.",
  "landing.close.p":
    "Erstelle dein Konto und Folio öffnet ein Demo-Projekt, das schon kompiliert: ins PDF klicken, eine Arbeit zitieren, eine Version speichern.",
  "landing.close.cta": "Konto erstellen und Demo öffnen",
  "landing.foot.note": "Selbst gehostet: Deine Arbeiten bleiben in deinem eigenen Postgres.",
  "landing.foot.note2": "Oberfläche auf Español, English und Deutsch.",
  "landing.foot.top": "Nach oben",
  "landing.foot.credit":
    "Bild: Titelblatt des First Folio, British Library, CC0. Video: „Printing in a letterpress“, Subhashish Panigrahi, CC BY-SA 4.0. Über Wikimedia Commons.",
  "landing.folio.reel": "Eine Buchdruckpresse in Cuttack, Indien.",
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
