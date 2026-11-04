// Strings of the landing page and the first-run (empty project list) migration
// guide. Merged into the main dictionaries (last, so the two `projects.*`
// overrides below win over the base copy). Add keys to `es` (the source of
// truth); `en` and `de` are typed against it, so a missing or extra key fails
// the typecheck.

const es = {
  // hero
  "landing.hero.title": "Escritura científica en LaTeX, en tu propio servidor.",
  "landing.hero.body":
    "Folio es un editor LaTeX autoalojado (Apache-2.0) con compilación aislada, un grafo de citas construido desde tu .bib y un asistente de IA opcional que nunca edita sin tu confirmación.",
  "landing.hero.cta.demo": "Ver una demo",
  // prism migration
  "landing.prism.title": "¿Vienes de Prism?",
  "landing.prism.body":
    "Prism (OpenAI) cierra el 1 de enero de 2027. Folio importa tu exportación tal cual y, a partir de ahí, tus documentos viven en tu propio Postgres.",
  "landing.prism.step1":
    "En Prism: Settings → Data Controls → Export all. Descarga el ZIP de cada proyecto.",
  "landing.prism.step2": "Crea tu cuenta en Folio.",
  "landing.prism.step3":
    "En Proyectos, «Importar ZIP»: Folio detecta el archivo principal y descarta lo que no compila.",
  "landing.prism.cta": "Empezar la migración",
  // features
  "landing.feat.title": "Qué hay dentro",
  "landing.feat.compile.t": "Compilación aislada",
  "landing.feat.compile.d":
    "latexmk en un contenedor sin salida a Internet; no instalas TeX en tu máquina.",
  "landing.feat.synctex.t": "PDF ↔ código",
  "landing.feat.synctex.d":
    "SyncTeX: pulsa una frase del PDF y el editor salta a su línea; los errores también.",
  "landing.feat.graph.t": "Grafo de citas",
  "landing.feat.graph.d":
    "Estilo Connected Papers, construido desde tu .bib con datos abiertos de OpenAlex.",
  "landing.feat.snap.t": "Versiones con diff",
  "landing.feat.snap.d": "Snapshots del proyecto y diff LaTeX (latexdiff) entre versiones.",
  "landing.feat.ai.t": "IA opcional",
  "landing.feat.ai.d":
    "Cualquier API compatible con OpenAI (Ollama, vLLM, Mistral…). Solo cita claves de tu .bib y no toca el documento sin tu confirmación.",
  "landing.feat.open.t": "Abierto y trilingüe",
  "landing.feat.open.d": "Apache-2.0, autoalojado; interfaz en español, inglés y alemán.",
  // stack / quickstart
  "landing.stack.title": "Puesta en marcha",
  "landing.stack.sub": "Tres pasos y compilando.",
  "landing.stack.1.t": "Levanta el stack",
  "landing.stack.1.d":
    "Postgres, el compilador LaTeX y la app; las migraciones se aplican al arrancar.",
  "landing.stack.2.t": "Crea una cuenta",
  "landing.stack.2.d": "Nombre, correo y contraseña. Nada sale de tu servidor.",
  "landing.stack.3.t": "Elige una plantilla y compila",
  "landing.stack.3.d":
    "IEEE, Elsevier, REVTeX, AMS, tesis, beamer… y pulsa Compilar (Ctrl + Enter).",
  // footer
  "landing.footer.tag": "Folio · Apache-2.0 · tus documentos, tu servidor",
  "landing.footer.code": "Código",
  // first-run: empty project list (overrides of base copy at the bottom)
  "projects.empty.hint":
    "Empieza con una plantilla, importa el ZIP de Prism u Overleaf, o crea un proyecto y arrastra tu .bib.",
  "projects.import.prism":
    "El importador acepta tal cual el ZIP de Prism (Settings → Data Controls → Export all), los proyectos de Overleaf y las fuentes de arXiv; detecta el archivo principal y descarta lo que no compila.",
  "projects.empty.tpl": "Nueva desde plantilla",
  "projects.empty.migrate":
    "¿Vienes de Prism? Settings → Data Controls → Export all, y sube aquí el ZIP: se importa tal cual.",
} as const;

const en: Record<keyof typeof es, string> = {
  // hero
  "landing.hero.title": "Scientific writing in LaTeX, on your own server.",
  "landing.hero.body":
    "Folio is a self-hosted LaTeX editor (Apache-2.0) with sandboxed compilation, a citation graph built from your .bib, and an optional AI assistant that never edits without your confirmation.",
  "landing.hero.cta.demo": "See a demo",
  // prism migration
  "landing.prism.title": "Coming from Prism?",
  "landing.prism.body":
    "Prism (OpenAI) shuts down on 1 January 2027. Folio imports your export as-is — and from then on your documents live in your own Postgres.",
  "landing.prism.step1":
    "In Prism: Settings → Data Controls → Export all. Download the ZIP of each project.",
  "landing.prism.step2": "Create your Folio account.",
  "landing.prism.step3":
    "In Projects, “Import ZIP”: Folio detects the main file and drops what does not compile.",
  "landing.prism.cta": "Start migrating",
  // features
  "landing.feat.title": "What's inside",
  "landing.feat.compile.t": "Sandboxed compilation",
  "landing.feat.compile.d":
    "latexmk in a container with no Internet access; no TeX to install on your machine.",
  "landing.feat.synctex.t": "PDF ↔ source",
  "landing.feat.synctex.d":
    "SyncTeX: click a sentence in the PDF and the editor jumps to its line; errors do too.",
  "landing.feat.graph.t": "Citation graph",
  "landing.feat.graph.d": "Connected-Papers style, built from your .bib on open OpenAlex data.",
  "landing.feat.snap.t": "Versions with diff",
  "landing.feat.snap.d": "Project snapshots and LaTeX diff (latexdiff) between versions.",
  "landing.feat.ai.t": "Optional AI",
  "landing.feat.ai.d":
    "Any OpenAI-compatible API (Ollama, vLLM, Mistral…). It only cites keys from your .bib and never touches the document without your confirmation.",
  "landing.feat.open.t": "Open and trilingual",
  "landing.feat.open.d": "Apache-2.0, self-hosted; UI in Spanish, English and German.",
  // stack / quickstart
  "landing.stack.title": "Getting started",
  "landing.stack.sub": "Three steps to a compiled PDF.",
  "landing.stack.1.t": "Start the stack",
  "landing.stack.1.d": "Postgres, the LaTeX compiler and the app; migrations run on start-up.",
  "landing.stack.2.t": "Create an account",
  "landing.stack.2.d": "Name, e-mail and password. Nothing leaves your server.",
  "landing.stack.3.t": "Pick a template and compile",
  "landing.stack.3.d":
    "IEEE, Elsevier, REVTeX, AMS, thesis, beamer… then hit Compile (Ctrl + Enter).",
  // footer
  "landing.footer.tag": "Folio · Apache-2.0 · your documents, your server",
  "landing.footer.code": "Code",
  // first-run: empty project list (overrides of base copy at the bottom)
  "projects.empty.hint":
    "Start from a template, import the Prism or Overleaf ZIP, or create a project and drop your .bib in.",
  "projects.import.prism":
    "The importer takes the Prism ZIP (Settings → Data Controls → Export all), Overleaf projects and arXiv sources as-is; it detects the main file and drops what does not compile.",
  "projects.empty.tpl": "New from template",
  "projects.empty.migrate":
    "Coming from Prism? Settings → Data Controls → Export all, then upload the ZIP here: it imports as-is.",
};

const de: Record<keyof typeof es, string> = {
  // hero
  "landing.hero.title": "Wissenschaftliches Schreiben in LaTeX, auf deinem eigenen Server.",
  "landing.hero.body":
    "Folio ist ein selbst gehosteter LaTeX-Editor (Apache-2.0) mit isoliertem Kompilieren, einem Zitiergraph aus deiner .bib und einem optionalen KI-Assistenten, der nie ohne deine Bestätigung bearbeitet.",
  "landing.hero.cta.demo": "Demo ansehen",
  // prism migration
  "landing.prism.title": "Du kommst von Prism?",
  "landing.prism.body":
    "Prism (OpenAI) wird am 1. Januar 2027 abgeschaltet. Folio importiert deinen Export unverändert — ab dann leben deine Dokumente in deinem eigenen Postgres.",
  "landing.prism.step1":
    "In Prism: Settings → Data Controls → Export all. Lade das ZIP jedes Projekts herunter.",
  "landing.prism.step2": "Erstelle dein Folio-Konto.",
  "landing.prism.step3":
    "Unter Projekte „ZIP importieren“: Folio erkennt die Hauptdatei und verwirft, was nicht kompiliert.",
  "landing.prism.cta": "Migration starten",
  // features
  "landing.feat.title": "Was drinsteckt",
  "landing.feat.compile.t": "Isoliertes Kompilieren",
  "landing.feat.compile.d":
    "latexmk in einem Container ohne Internetzugriff; kein TeX auf deiner Maschine.",
  "landing.feat.synctex.t": "PDF ↔ Quelltext",
  "landing.feat.synctex.d":
    "SyncTeX: Klicke auf einen Satz im PDF und der Editor springt zu seiner Zeile; Fehler genauso.",
  "landing.feat.graph.t": "Zitiergraph",
  "landing.feat.graph.d":
    "Im Stil von Connected Papers, gebaut aus deiner .bib auf offenen OpenAlex-Daten.",
  "landing.feat.snap.t": "Versionen mit Diff",
  "landing.feat.snap.d": "Projekt-Snapshots und LaTeX-Diff (latexdiff) zwischen Versionen.",
  "landing.feat.ai.t": "Optionale KI",
  "landing.feat.ai.d":
    "Jede OpenAI-kompatible API (Ollama, vLLM, Mistral…). Zitiert nur Schlüssel aus deiner .bib und bearbeitet nie ohne deine Bestätigung.",
  "landing.feat.open.t": "Offen und dreisprachig",
  "landing.feat.open.d":
    "Apache-2.0, selbst gehostet; Oberfläche auf Spanisch, Englisch und Deutsch.",
  // stack / quickstart
  "landing.stack.title": "Inbetriebnahme",
  "landing.stack.sub": "Drei Schritte bis zum kompilierten PDF.",
  "landing.stack.1.t": "Stack hochfahren",
  "landing.stack.1.d": "Postgres, der LaTeX-Compiler und die App; Migrationen laufen beim Start.",
  "landing.stack.2.t": "Konto erstellen",
  "landing.stack.2.d": "Name, E-Mail und Passwort. Nichts verlässt deinen Server.",
  "landing.stack.3.t": "Vorlage wählen und kompilieren",
  "landing.stack.3.d":
    "IEEE, Elsevier, REVTeX, AMS, Abschlussarbeit, Beamer… dann „Kompilieren“ (Ctrl + Enter).",
  // footer
  "landing.footer.tag": "Folio · Apache-2.0 · deine Dokumente, dein Server",
  "landing.footer.code": "Code",
  // first-run: empty project list (overrides of base copy at the bottom)
  "projects.empty.hint":
    "Starte mit einer Vorlage, importiere das Prism- oder Overleaf-ZIP, oder erstelle ein Projekt und zieh deine .bib hinein.",
  "projects.import.prism":
    "Der Importer nimmt das Prism-ZIP (Settings → Data Controls → Export all), Overleaf-Projekte und arXiv-Quellen unverändert; er erkennt die Hauptdatei und verwirft, was nicht kompiliert.",
  "projects.empty.tpl": "Neu aus Vorlage",
  "projects.empty.migrate":
    "Du kommst von Prism? Settings → Data Controls → Export all, dann das ZIP hier hochladen: es wird direkt importiert.",
};

export const landingDict = { es, en, de };
