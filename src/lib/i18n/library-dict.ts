// Strings of the project library and the checks view (Papers tab). Merged into
// the main dictionaries. Add keys to `es` (the source of truth); `en` and `de`
// are typed against it, so a missing or extra key fails the typecheck.

const es = {
  // library
  "lib.title": "Bibliografía del proyecto",
  "lib.summary": "{n} entradas · {cited} citadas · {unused} sin usar",
  "lib.graph": "Grafo de mi bibliografía",
  "lib.graph.hint": "Explora cómo se citan entre sí tus referencias.",
  "lib.filter.ph": "Filtrar por título, autor o clave…",
  "lib.sort": "Ordenar",
  "lib.sort.bib": "Orden en el .bib",
  "lib.sort.year": "Año ↓",
  "lib.sort.title": "Título A–Z",
  "lib.sort.unused": "Sin usar primero",
  "lib.cited": "Citada",
  "lib.unused": "Sin usar",
  "lib.insert": "Insertar",
  "lib.insert.off": "Abre un archivo .tex para insertar la cita en el cursor",
  "lib.explore": "Explorar",
  "lib.explore.off": "Esta entrada no tiene DOI: no se puede dibujar su grafo",
  "lib.open": "Ver en el editor",
  "lib.none":
    "Todavía no hay entradas .bib en el proyecto. Cita un paper desde Buscar o pega tu .bib como archivo.",
  "lib.nomatch": "Ninguna entrada coincide con el filtro.",
  "lib.inGraph": "{n} con DOI, listas para el grafo",
  // check
  "check.title": "Revisión del proyecto",
  "check.run": "Revisar proyecto",
  "check.running": "Revisando…",
  "check.hint":
    "Citas sin usar o rotas, mejoras de preprint a publicado y la lista de envío: todo en un informe.",
  "check.verdict.ok": "Todo en orden: no hay nada pendiente.",
  "check.verdict.n": "{n} cosas que mirar antes de enviar",
  "check.citations": "Citas",
  "check.submission": "Lista de envío",
  "check.error": "La revisión falló",
};

const en: Record<keyof typeof es, string> = {
  "lib.title": "Project bibliography",
  "lib.summary": "{n} entries · {cited} cited · {unused} unused",
  "lib.graph": "Graph of my bibliography",
  "lib.graph.hint": "See how your references cite each other.",
  "lib.filter.ph": "Filter by title, author or key…",
  "lib.sort": "Sort",
  "lib.sort.bib": "Order in the .bib",
  "lib.sort.year": "Year ↓",
  "lib.sort.title": "Title A–Z",
  "lib.sort.unused": "Unused first",
  "lib.cited": "Cited",
  "lib.unused": "Unused",
  "lib.insert": "Insert",
  "lib.insert.off": "Open a .tex file to insert the citation at the cursor",
  "lib.explore": "Explore",
  "lib.explore.off": "This entry has no DOI: its graph cannot be drawn",
  "lib.open": "Show in editor",
  "lib.none":
    "No .bib entries in the project yet. Cite a paper from Search or paste your .bib as a file.",
  "lib.nomatch": "No entry matches the filter.",
  "lib.inGraph": "{n} with a DOI, ready for the graph",
  "check.title": "Project review",
  "check.run": "Review project",
  "check.running": "Reviewing…",
  "check.hint":
    "Unused or broken citations, preprint-to-published upgrades and the submission list: one report.",
  "check.verdict.ok": "All clear: nothing pending.",
  "check.verdict.n": "{n} things to look at before submitting",
  "check.citations": "Citations",
  "check.submission": "Submission list",
  "check.error": "The review failed",
};

const de: Record<keyof typeof es, string> = {
  "lib.title": "Projekt-Bibliografie",
  "lib.summary": "{n} Einträge · {cited} zitiert · {unused} unbenutzt",
  "lib.graph": "Graph meiner Bibliografie",
  "lib.graph.hint": "Sehen Sie, wie sich Ihre Referenzen gegenseitig zitieren.",
  "lib.filter.ph": "Nach Titel, Autor oder Schlüssel filtern …",
  "lib.sort": "Sortieren",
  "lib.sort.bib": "Reihenfolge in der .bib",
  "lib.sort.year": "Jahr ↓",
  "lib.sort.title": "Titel A–Z",
  "lib.sort.unused": "Unbenutzte zuerst",
  "lib.cited": "Zitiert",
  "lib.unused": "Unbenutzt",
  "lib.insert": "Einfügen",
  "lib.insert.off": "Öffnen Sie eine .tex-Datei, um das Zitat am Cursor einzufügen",
  "lib.explore": "Erkunden",
  "lib.explore.off": "Dieser Eintrag hat keinen DOI: sein Graph lässt sich nicht zeichnen",
  "lib.open": "Im Editor anzeigen",
  "lib.none":
    "Noch keine .bib-Einträge im Projekt. Zitieren Sie eine Arbeit über die Suche oder fügen Sie Ihre .bib als Datei ein.",
  "lib.nomatch": "Kein Eintrag passt zum Filter.",
  "lib.inGraph": "{n} mit DOI, bereit für den Graphen",
  "check.title": "Projektprüfung",
  "check.run": "Projekt prüfen",
  "check.running": "Prüfe …",
  "check.hint":
    "Unbenutzte oder defekte Zitate, Upgrades von Preprint zu Publikation und die Einreichungsliste: ein Bericht.",
  "check.verdict.ok": "Alles in Ordnung: nichts offen.",
  "check.verdict.n": "{n} Punkte vor der Einreichung ansehen",
  "check.citations": "Zitate",
  "check.submission": "Einreichungsliste",
  "check.error": "Die Prüfung ist fehlgeschlagen",
};

export const libraryDict = { es, en, de };
