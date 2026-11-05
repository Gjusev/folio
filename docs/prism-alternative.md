# Folio, the open alternative to Prism

> Status: strategy note, November 2026. Every claim about other products links
> to its source; anything we could not verify is marked "not stated".

## What Folio is

**Folio is an open, self-hosted workspace for writing scientific papers with
AI.** It does what researchers used Prism for — an assistant that knows the
whole paper, literature at hand, real-time co-authoring — on a server you
control, with the model you choose, and with AI whose every step you can audit.

LaTeX is the format, not the category. Journals, arXiv and mathematics run on
LaTeX, so Folio is LaTeX-native; but the product is the **writing loop** around
it: find the literature → plan the paper → draft with real citations → compile →
get reviewed → revise → submit.

## Why now

- **Prism is closing.** OpenAI launched Prism on 27 January 2026 on top of
  Crixet, a cloud LaTeX editor it had acquired, and is shutting it down on
  **1 January 2027**; project data is deleted afterwards and cannot be
  recovered ([OpenAI community announcement][prism-shutdown],
  [coverage][automater]). OpenAI's Prism-to-Codex migration guide points users to Codex, which edits
  files in a local folder and, in the guide's own words, "does not reproduce
  Prism's shared real-time editor" ([coverage][automater]).
- **The lesson.** A free AI workspace owned by a model vendor can disappear,
  with the drafts in it. The answer is not another closed service with a later
  end date, but software you can run and keep.
- **The incumbent moved AI into its plans.** Overleaf now ships "Overleaf AI"
  (assistant, Error Assist, Writefull language tools, rewrite tools) within
  daily allowances on its hosted plans, running on OpenAI
  ([Overleaf docs][overleaf-ai], [Error Assist][overleaf-error-assist]).

## Four promises

1. **AI that knows the whole paper.** Assistant with the project's context and
   retrieval over your own `.tex`/`.bib`; a drafting agent that brings real
   literature as evidence; a section planner; a structured reviewer; error
   fixing; images to LaTeX.
2. **AI you can audit.** Every AI change is shown as a diff and applied by you.
   Cite keys are limited to your bibliography and to literature actually
   retrieved — anything else is removed on the server — and drafts are verified
   against a real compile. Reviews keep a location only if the quoted text is
   really there. The project keeps a ledger of AI use, from which Folio writes
   the disclosure journals ask for.
3. **Yours.** Apache-2.0, your Postgres, ZIP export at any time. Any
   OpenAI-compatible provider or Anthropic's native API, each user with their
   own key, local models (Ollama, vLLM) first-class. The project owner decides
   whether a manuscript may leave the server for AI at all.
4. **The whole loop.** Literature search across OpenAlex, Semantic Scholar and
   arXiv; a Connected-Papers-style explorer; Zotero; citation health; snapshots
   with latexdiff; anchored comments; arXiv-ready packages; submission checks.

## Capability map

Legend: ✓ available · ◐ partial · — not offered · "n/s" not stated in the
sources below. "Branch" = implemented on `feat/ai-writing-pack` (this note's
companion work), verified but not yet merged.

| Capability                                   | Prism                       | Overleaf AI                         | Folio                                                               |
| -------------------------------------------- | --------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Assistant with whole-paper context           | ✓ [^p]                      | ✓ assistant                         | ✓ assistant + retrieval over your own files                         |
| Rewrite a selection in place                 | ✓ [^p]                      | ✓ rewrite tools                     | ✓ — **branch:** word-level diff before applying, rewrite presets    |
| Fix compile errors                           | n/s                         | ✓ Error Assist: diff, apply, recompile | ◐ explanation + snippet — **branch:** patch on the failing lines, diff, apply and recompile |
| Whiteboard / handwriting / image → LaTeX     | ✓ [^p]                      | ◐ text generators for tables and equations | **branch:** any vision model, result compiled in the sandbox first |
| Literature search inside the workspace       | ✓ [^p]                      | n/s                                 | ✓ three engines, explorer graph, Zotero                             |
| Drafting with citations                      | ✓ [^p]                      | ◐ generators                        | ✓ only real keys; verified against a throwaway compile              |
| Pre-submission review                        | n/s                         | ◐ Citation Reviewer (institutional) | ✓ review mode with verified quotes and locations                    |
| Real-time co-authoring                       | ✓ unlimited [^p]            | ✓                                   | ◐ experimental (Yjs) + anchored comments                            |
| Voice editing                                | ✓ optional [^p]             | n/s                                 | — (planned, see below)                                              |
| AI autocomplete                              | n/s                         | ✓ Supercomplete                     | — (planned)                                                         |
| Grammar and language suggestions             | ◐ proofreading              | ✓ Writefull                         | ◐ rewrite presets; LanguageTool without AI planned                  |
| Choose the model, bring your own key         | — OpenAI only               | — OpenAI                            | ✓ any OpenAI-compatible endpoint or Anthropic; per-user keys        |
| Local models (nothing leaves the server)     | —                           | —                                   | ✓ Ollama, vLLM, SGLang…                                             |
| Per-project AI policy binding collaborators  | —                           | ◐ organisation-wide opt-out         | **branch:** any / local models only / off                           |
| AI-use disclosure from a recorded log        | —                           | —                                   | **branch:** generated from the project's ledger                     |
| Self-hosting                                 | —                           | ◐ Community Edition; AI is in hosted plans | ✓ Docker Compose, Dokploy                                     |
| Your data after the vendor changes course    | deleted on 2027-01-01       | hosted                              | your Postgres; Apache-2.0                                           |

[^p]: Capabilities as announced at launch, summarised in [this write-up][devto];
    OpenAI's own page answers 403 to automated fetches.

## What only an open workspace can promise

- **Model freedom, including none.** Cloud, local or no AI — per user, and per
  project when the owner restricts it.
- **Confidential manuscripts.** Embargoed results, grant proposals, clinical
  data: the owner sets the project to *local models only* (or *off*), and the
  server refuses any collaborator's cloud key for that project — including for
  retrieval embeddings, which send manuscript chunks to a provider.
- **Verifiability over persuasion.** Citations that cannot be invented, quotes
  that must exist, drafts checked by a real compile, diffs before every change.
- **Honest disclosure.** Elsevier asks authors to declare generative-AI use in a
  separate section before the references
  ([policy][elsevier-ai]); Folio writes that declaration from what was actually
  recorded, in English, Spanish or German.
- **No end date.** The code is Apache-2.0; the data is in your database.

## What to add, in order

### Now — on `feat/ai-writing-pack`

1. **Reviewed edits.** Every rewrite of a selection (improve, shorten, academic
   tone, simplify, translate) is shown as a word-level diff and applied by the
   author; undo works as for any edit.
2. **Error fixes as patches.** "Fix" locates the first error with a file and a
   line, asks for a minimal patch inside a window of numbered lines, verifies the
   range, shows the diff and offers *Apply and recompile*.
3. **Image → LaTeX.** Paste or drop a photo or screenshot (equation, table,
   diagram, notes); the model returns LaTeX through either protocol, and Folio
   compiles it in the sandbox before showing whether it builds. Images are never
   stored.
4. **Project AI policy** (any / local only / off), enforced on the server for
   every route that can reach a provider.
5. **AI-use ledger and disclosure.** Metadata only (action, model, date), never
   content, never pruned; the disclosure is generated from it.

### Next — proposed "AI writing pack 2"

6. **Bring your own agent (MCP + personal access tokens).** Let Claude Code,
   Codex or any MCP client work on a Folio project: read files, compile, search
   literature, propose edits that arrive as reviewable suggestions. OpenAI sends
   Prism users to Codex, which has no shared editor — Folio can be that shared
   editor. ([LetX lists an MCP server][letx] without details; we would publish
   the tool list and permission model.)
7. **Autocomplete**, opt-in per user, short context, with the cost (the user's
   own key) stated next to the switch.
8. **Generators.** Title, abstract and keywords from the manuscript; a pasted
   CSV or spreadsheet range to a `booktabs` table (deterministic, no AI); data to
   a `pgfplots` figure (AI, compile-checked).
9. **Translation workflow.** Translate a section paragraph by paragraph with
   LaTeX preserved and a diff per paragraph — for authors who write in their
   language and submit in English.
10. **Voice dictation** through the user's own provider (an OpenAI-compatible
    transcription endpoint), not the browser's speech API — in some browsers
    that sends audio to the browser vendor, which a privacy-first tool should
    not do silently.
11. **Alt text for figures**, proposed from the image and caption, for
    accessible PDFs.
12. **Notation consistency**: symbols used before they are defined, notation that
    changes between sections (static checks first, AI second).

### Already planned (master plan)

Review mode v2 and review → response letter (Phase 3), venue profiles,
LanguageTool and optional SMTP (Phase 4), per-job compile isolation (Phase 5),
the Prism-closing release (Phase 6). See
[`superpowers/plans/2026-11-04-folio-master-plan.md`](superpowers/plans/2026-11-04-folio-master-plan.md).

### Deliberately not doing

- Edits applied without the author seeing them.
- Training or fine-tuning on users' documents; storing images sent to the model.
- Plagiarism or "AI detection" scores: there is no open, defensible dataset to
  back such a number.

## Migrating from Prism

The importer accepts the Prism export as-is (an end-to-end test checks it
against a fixture of the format). According to a competitor's migration notes,
Prism's export leaves out history, comments and sharing settings, so
co-authors have to be invited again ([LetX][letx-migrate]).

## Sources

- [prism-shutdown]: <https://community.openai.com/t/prism-will-shut-down-on-january-1-2027/1411150>
- [automater]: <https://automater.ai/news/openai-prism-shutdown-january-2027-export-codex/>
- [cellcog]: <https://cellcog.ai/blog/openai-prism-shutdown/>
- [devto]: <https://dev.to/alifar/openai-prism-launches-a-gpt-52-workspace-for-scientific-and-latex-writing-1o5j>
- [overleaf-ai]: <https://docs.overleaf.com/integrations-and-add-ons/ai-features>
- [overleaf-error-assist]: <https://docs.overleaf.com/integrations-and-add-ons/ai-features/error-assist>
- [elsevier-ai]: <https://www.elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals>
- [letx]: <https://letx.app/vs/prism/>
- [letx-migrate]: <https://letx.app/blog/prism-shutting-down/>

[prism-shutdown]: https://community.openai.com/t/prism-will-shut-down-on-january-1-2027/1411150
[automater]: https://automater.ai/news/openai-prism-shutdown-january-2027-export-codex/
[cellcog]: https://cellcog.ai/blog/openai-prism-shutdown/
[devto]: https://dev.to/alifar/openai-prism-launches-a-gpt-52-workspace-for-scientific-and-latex-writing-1o5j
[overleaf-ai]: https://docs.overleaf.com/integrations-and-add-ons/ai-features
[overleaf-error-assist]: https://docs.overleaf.com/integrations-and-add-ons/ai-features/error-assist
[elsevier-ai]: https://www.elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals
[letx]: https://letx.app/vs/prism/
[letx-migrate]: https://letx.app/blog/prism-shutting-down/
