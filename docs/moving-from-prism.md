# Moving from Prism to Folio

Prism closes on **1 January 2027** and project data is deleted afterwards.
This page is the whole migration: what to export, what arrives intact, what
to redo, and what Folio does differently on the other side.

If you have never run a server before, start with
[deployment](deployment.md) — Folio runs on any Docker host, and the
reference deployment is a single compose file. If you just want to look
around, a friend's instance or your own takes about ten minutes to stand up.

## 1. Export from Prism

**Settings → Data Controls → Export all.** You get a ZIP with your projects'
LaTeX sources (`.tex`, figures, `.bib`). Download it and keep a copy: after
the shutdown there is no way to recover it.

## 2. Import into Folio

Create an account on your Folio instance and use **Import ZIP** on the
projects screen (or the welcome screen). The importer unpacks the archive,
takes `.tex`, figures and `.bib` files, shows you the project name and main
file it detected, and creates the project. Repeat per Prism project — each
ZIP becomes one Folio project.

What travels as-is:

- **LaTeX sources** — everything TeX needs: `\input`/`\include` trees,
  figures, class files if you shipped them.
- **The `.bib` file** — your bibliography arrives with the project; the
  citation-health panel immediately shows keys used, defined and unused.
- **Figures** — PNG/JPG/PDF, referenced or not.

What does **not** travel (Prism does not export it):

- **Chat history and AI settings.** There is nothing to migrate; in Folio the
  AI provider is your own key (Settings → AI) or your instance's shared one.
- **Comments and review notes** made in Prism.
- **Version history.** Nothing to migrate — but create a Folio snapshot right
  after importing, and you have a named baseline for the latexdiff from then
  on.

## 3. The five minutes after importing

1. **Compile once** (Ctrl+Enter). If Prism's build differed, the linked error
   list tells you exactly what to fix.
2. **Run the submission check** (Papers → Review): citation health, unused
   entries, missing figures, abstract — with the venue profile of your
   target (NeurIPS, ICML, ACL, IEEE, Elsevier, Springer LNCS or arXiv).
3. **Snapshot** the working state (Versions menu). Every later snapshot can
   be visually diffed (latexdiff) against any other.
4. If you like, attach PDFs you already read to your **library** — a detected
   DOI cites them into the project, and "attach" lets the assistant answer
   from your own papers.

## 4. What you gain on the Folio side

The point is not to replace the editor — it is the writing loop around it:

- **AI with receipts**: review mode returns comments pinned to verified lines
  (the server drops anything it cannot verify), drafting proposes and you
  apply, citations are checked against a real compile.
- **The publication workflow**: response letters built from reviewer comments
  (pasted or Folio's own review), arXiv-ready source export with pre-flight
  checks, venue-aware submission checks.
- **Co-authors on your terms**: share by e-mail with editor/viewer roles,
  inline comments anchored to the text (anchors survive edits), experimental
  real-time collaboration you can switch on per instance.
- **No lock-in**: Postgres you own, ZIP export of everything at any time,
  Apache-2.0 code.

## 5. Honest limits

- Real-time collaboration is opt-in and experimental.
- AI features need an OpenAI-compatible key (yours or the instance's); RAG
  additionally needs an embedding provider.
- Grammar checking (LanguageTool) and e-mail (SMTP) ship off by default; the
  admin enables them with one variable each.
- One web instance per deployment: rate limits live in memory and the
  compiler is a shared, per-job-sandboxed container.

Something missing in your migration? [Open an issue](https://github.com/Gjusev/folio/issues) with what Prism exported and what you
expected — the importer improves with every real archive it sees.
