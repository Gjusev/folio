# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.2.0] - 2026-11-06

The publication workflow release: from draft to submission package with AI
that never edits behind your back. Also the biggest interface and
infrastructure hardening round since the first release.

### Added — the interface wave

- **API errors in your language.** 89 server-side error sites (auth, projects,
  files, snapshots, AI, reviews, comments, tokens) now carry a message key;
  the response is rendered in the interface language (es/en/de). Spanish
  users see byte-identical messages; Zod validation issues unchanged.
- **Appearance preferences** (Settings): light/dark/system theme (applied
  before first paint, no flash), interface font (IBM Plex Sans, Switzer,
  system), text size S/M/L app-wide, and editor font — persisted per user,
  with the graph canvas following the chosen theme.
- **Guided tour**: a ten-task checklist in the Files sidebar covering every
  feature (compile, PDF↔source, cite, library, graph, snapshots, checks,
  review, sharing), progress ring fed by real workspace events and
  server-side truths, «show me» buttons that take you to the exact place,
  dismiss with a way back in. No confetti, no badges — progress you can
  trust because it counts what actually happened.
- **Thinking and streaming** in the assistant: reasoning deltas (DeepSeek's
  `reasoning_content`, gateways' `reasoning`, Anthropic's
  `thinking_delta`) stream into a collapsible «Thinking» trace with live
  seconds that collapses when the answer starts; answers render as safe
  markdown (LaTeX untouched, http(s)-only links) with a live caret; the
  last answer can be regenerated. Thinking is never persisted.
- **Personal PDF library** (`/library`): upload your downloaded papers
  (≤25 MB, PDF magic checked), read them in the browser, and use them —
  a detected DOI cites the paper into a project's `.bib`, and «attach»
  indexes the paper's extracted text into that project's RAG so the
  assistant answers from your own PDFs. Detach removes exactly those
  chunks.
- **Landing, judged**: category line under the rebus headline with the
  action tied to it; the hero artifact redrawn as a real page (margin
  frame, justified greeked lines, folio number); one heading step instead
  of three near-identical sizes; bands with the switch beside the
  statement; entrances for every section part. Measured: 3 FAIL + 3 WARN
  before → **0 FAIL, 0 WARN** after, at 1440/768/390.
- **Export fix**: the sources ZIP always downloads with a proper
  `name.zip` filename (the link only relied on Content-Disposition).

### Added — bring your own agent

- **Personal access tokens** (Settings → Agent access): scoped keys
  (`read`, `write`, `compile`, `literature`) that let your own tools act as
  you. Only the SHA-256 hash is stored; the token is shown once. Tokens cannot
  manage tokens.
- **MCP server** at `/api/mcp` (Streamable HTTP, stateless): nine tools —
  list/get projects, read/write files with optimistic concurrency, compile in
  the sandbox (log and errors, never PDF bytes), search literature, add a
  reference to the `.bib`, create/list snapshots. Project roles are enforced
  (a viewer's token cannot write); every tool checks its scope. Tool list and
  permission model documented in `docs/mcp.md`.

### Added — the AI writing pack

- **Tables from pasted data.** Paste a CSV or a spreadsheet range and get a
  booktabs table — deterministic, no AI: the preview is exactly the LaTeX that
  will be inserted, numeric columns align right, and every special is escaped.

- **Reviewed rewrites.** Select a passage and rewrite it — improve, shorten,
  academic tone, simplify, fix grammar, or translate (English, Spanish, German).
  Every proposal is shown as a word-level diff (deletions struck, insertions
  highlighted) and lands only when the author applies it; an _Apply_ that finds
  the text changed says so instead of writing somewhere else. The diff engine
  is a token-level Myers diff with a reconstruction property test.
- **Compile errors as patches.** "Fix" now locates the first error with a file
  and line, asks the model for a minimal patch inside a numbered window of the
  source, validates the line range, and shows the patch as a diff with one
  _Apply and recompile_ action. When the log has nothing locatable, it falls
  back to today's streamed explanation.
- **Image → LaTeX.** Drop, paste or pick a photo — a whiteboard, a handwritten
  equation, a table, a sketch — and get LaTeX back through any vision model on
  either wire format (OpenAI-compatible or Anthropic's Messages API). Folio
  compiles the snippet in the sandbox before showing whether it builds, says so
  honestly when the compiler cannot be reached, and never stores the image.
- **Per-project AI policy.** The project owner decides whether AI may touch the
  manuscript at all: any provider (default), local models only, or off —
  enforced on the server for every collaborator's own key, retrieval indexing
  included, with a clear message when the policy (rather than a missing
  provider) is what stops a user.
- **AI-use record and journal declaration.** Every successful AI call is logged
  per project (action, model, date — never content, never pruned), and Folio
  generates the generative-AI declaration journals ask for (Elsevier's
  structure) in English, Spanish or German, ready to insert before the
  references.
- **Positioning.** Folio is the open alternative to OpenAI's Prism: new landing
  copy, README opening, capability map against Prism and Overleaf AI with
  sources, and the next steps (`docs/prism-alternative.md`).

### Fixed

- Literature graph: OpenAlex can return the same work both among an origin's
  references and in its citing sample; the duplicated node reached the graph
  builder and crashed the whole page when exploring from that origin. Duplicates
  are now dropped at three layers (pool unification, batch fetch, builder guard).
- BibTeX authors written as "Family, Given" (the bundled template's form) were
  displayed with given names ("Ashish, Noam"); surnames are now read in either
  BibTeX order across the library, the graph list and node labels.
- Localisation: real plurals for countable strings (`{n:singular|plural}` —
  "1 Eintrag" instead of "1 Einträge"), the PDF zoom control no longer says
  "Ajustar" in every language, and the submission report's per-check details are
  translated (the API now returns message keys instead of Spanish text).
- Editor header wraps to a second row on phones instead of pushing the compile
  button off-screen; the landing page's install command wraps by words instead
  of being cut mid-flag; shorter German placeholders where inputs are narrow.

### Added

- Inline comments: select text in the editor and comment on it. Threads span
  all project files in a drawer (replies, resolve/reopen, delete by author or
  owner), comments mark the gutter line they point at, and the stored anchor
  relocates to follow the quoted text when the file is edited around it.
  Viewers may comment; resolving is limited to editors.
- Review mode (AI critique): a "Review" tab in the editor. The author picks the
  scope (the whole document, or individual sections across files), the aspects
  (clarity, structure, argument, evidence, citations, language, math, format),
  the reviewer's profile (colleague, journal reviewer, "Reviewer 2") and an
  optional focus. It returns a summary, per-aspect scores and comments that
  point to real lines. The server drops any location or quotation it cannot
  verify against the text it sent, never edits a file, and the result can be
  filtered by severity and aspect, dismissed, and copied as Markdown.
- Demo project: a finished, localised (es/en/de) reading note that compiles out
  of the box (equations, a TikZ figure, a table, real citations, one deliberately
  uncited entry for the citation-health panel). Offered at sign-up (checked by
  default), on the welcome screen, and from the project list.
- Onboarding: a new sign-up page with the product pitch, show/hide password and
  a live length hint; after sign-up the user lands in the demo project or on a
  welcome screen with three ways to start (demo, template, import).
- Landing page redesigned: one sentence as the layout, a live Prism
  countdown, sentences with switches, a "stages" slider driven by real product
  screenshots (`pnpm exec node scripts/landing-shots.mjs` regenerates them), and
  a self-hosted typeface.
- `docker-compose.dokploy.yml`: the stack for Dokploy/Traefik deployments, with
  no published host ports and explicit subnets.

- Brand identity: a mark (an open folio — the source leaf in ink, the result
  leaf in teal), an outlined Switzer wordmark, palette, typography and voice in
  `docs/brand-guidelines.md`. `node scripts/brand-assets.mts` renders every
  asset from `src/lib/brand.ts`: SVG logos, app and maskable icons, favicon,
  the Open Graph/Twitter image, GitHub's social preview and README banners.
- Documentation rewritten in English: README, `docs/architecture.md`,
  `docs/deployment.md` (with an environment reference), `docs/ai.md`,
  `docs/roadmap.md`, an English summary of the November audits, and English
  CONTRIBUTING, SECURITY and RELEASE.

### Changed

- The app logo is the new mark and wordmark (inline SVG that follows light and
  dark themes); new `APP_URL` variable for absolute Open Graph URLs.
- `IMPLEMENTATION_PLAN.md` and `reviews/` were replaced by `docs/`; the
  per-iteration notes remain in the git history.
- The interface language now follows the browser's `Accept-Language` (es, en,
  de) when no language has been chosen explicitly; unsupported languages fall
  back to English instead of Spanish. The language switcher still wins.

### Added (earlier in this release)

- BYOK policy for AI keys: `LLM_ENV_SHARED=false` removes the server's `.env`
  key from every account, so each user must add their own provider in Settings
  (keys are per-user, sealed at rest, never returned to the browser — the UI
  only ever sees whether one exists). While the default `true` stands, Settings
  warns that everyone on the instance can use the `.env` key. Verified live:
  with the flag off, the profile list is empty and the assistant answers 503
  even with a configured environment key.
- Section executor for the drafting agent: each plan row drafts against an
  explicit word budget (reported honestly, never truncated), a second critique
  pass flags unsupported claims, citation misuse and structure issues (shown
  as chips — the AI never auto-edits), and citations are verified against a
  throwaway sandbox compile of the document with the draft inserted, separating
  keys that resolve, keys pending until the new references are added, and keys
  that are genuinely broken. When the active file is not reachable from the
  main file through `\input`/`\include`, verification says so instead of
  reporting unchecked keys as resolved.
- `pnpm reset-password <email>`: admin-side password reset for self-hosted
  instances (no email server is assumed).

### Added — the publication workflow

- **arXiv export**: the Export menu builds the package arXiv expects. The
  compiler resolves the file closure exactly as TeX does (`\input`/`\include`
  with TeX's path rules, figures, `.bib`, the generated `.bbl`), and the
  dialog runs honest pre-flight checks — file names, `pdfoutput`, paths, EPS,
  shell-escape leftovers, bbl freshness, size — before the ZIP download.
- **Review mode v2**: reviews are saved per project with the filters that
  produced them, reloaded across devices, with a history list and per-comment
  states (resolved/dismissed kept on the server). Comparing two runs shows
  what was resolved, what is new and what is still open (matched by aspect,
  location and quote). Any comment can be handed to the assistant as a
  fix instruction — the assistant proposes, nothing is applied silently.
- **Response letter**: comments from a saved Folio review, pasted text from
  real journal reviewers, or both, become the response-letter template — one
  item per comment (quote, link to the changed lines, response placeholder).
  The parser of pasted reviews understands numbered points, `R1.2`-style
  labels, bullets, multi-paragraph points and severity words in English,
  Spanish and German; everything is LaTeX-escaped. The AI can draft responses
  for the empty ones (marked as drafts, in the document too), the letter
  compiles without touching the project's main file, and choosing a snapshot
  adds an appendix that names it next to the latexdiff.
- **Venue profiles** in the submission check: NeurIPS, ICML, ACL, IEEE
  conferences, Elsevier, Springer LNCS and arXiv, each rule carrying its
  official source URL and verification date (all seven guides opened and
  checked by hand; two candidate values were corrected against the official
  pages, IEEE's bot-wall is declared unverified). With a venue selected the
  check adds the page count from the real compiled PDF, blind-review signals
  (author blocks, acknowledgements, grants — presented as possible signals,
  never verdicts), missing required sections (ACL's Limitations) and the
  expected bibliography style. Without a venue the checklist is exactly as it
  was.
- **Optional grammar checking (LanguageTool)**: `LANGUAGETOOL_URL` empty means
  off, as shipped. When set, prose is extracted from the LaTeX (comments,
  math and technical commands stripped) with a character-level map back to
  the source, so every finding jumps to its exact line. Findings join the
  chktex list; a down server costs one request, a slow one is cut at a run
  budget; chktex results render before grammar arrives.
- **Optional e-mail (SMTP)**: `SMTP_*` unset means off, as shipped. When
  configured: password reset by e-mail (single-use 30-minute tokens stored
  hashed, a reset revokes every session) and invitation e-mails for shared
  projects. Reset links are built only from `APP_URL`; `forgot` answers
  identically whether the account exists or not — no enumeration by response
  or by timing. `pnpm reset-password` remains for admins.

### Added — interface and landing

- The landing speaks the product's main claim: "Write with AI. Or without
  it." over a real writing contract fragment, nine native dark films of the
  actual product, and a Prism countdown that switches itself to "Prism has
  closed" on 2027-01-01. A `docs/moving-from-prism.md` guide backs the
  countdown.
- Mobile audit wave (six screens, 52 findings): the projects header, the
  editor tab strip, the PDF worker in standalone builds (extraction was dead
  in production), and `/library` layout at 375 px; a single coarse-pointer
  pass raises every control to the 44 px touch minimum with 16 px inputs (no
  iOS focus zoom); plus 23 major fixes (dark-mode editor syntax colors,
  destructive-action confirmations, wrapping metadata, real dialogs).
- API rate limits scale with `RATE_LIMIT_MULTIPLIER` for large self-hosted
  instances and test suites; the default (1) changes nothing.

### Changed — compiler hardening

- The compiler now carries a self-adapting per-job sandbox: at boot it probes
  whether the host lets it create user+mount namespaces and, when it does,
  every latexmk/chktex/texcount/synctex/latexdiff job runs inside a
  bubblewrap jail (no network, no IPC, read-only root, the job directory as
  the only writable path). On hosts that forbid it — like the reference
  Dokploy deployment, where Docker's default seccomp blocks the namespace
  calls — the compiler keeps its previous hardening (unprivileged user, no
  capabilities, read-only rootfs, internal network, `openin/out_any`,
  `shell_escape` off) and `/health` reports which mode is active. The full
  evidence trail, including one tried-and-reverted seccomp trade, is in
  `deploy/seccomp-README.md`.

### Fixed

- PDF text extraction was dead in standalone production builds (the pdf.js
  worker chunk never loaded); citing and attaching from the library now work
  there, with an e2e that uploads a real PDF to keep it that way.
- Spanish at 375 px: the projects header pushed "Cerrar sesión" off-screen
  and the Review tab was unreachable behind the clipped tab strip.
- CodeMirror used light-only default syntax colors: brackets sat at 1.4:1
  contrast in dark mode; the editor now derives its highlight theme from the
  app palette.

[0.2.0]: https://github.com/Gjusev/folio/releases/tag/v0.2.0

## [0.1.0] - 2026-11-04

First release. Self-hosted, multi-user LaTeX editor with isolated compilation,
literature search and citation-graph exploration, and an optional
provider-agnostic AI assistant. Apache-2.0.

### Added

**Accounts, projects and files**

- Local accounts with AES-256-GCM-sealed session cookies; login rate limiting
  per IP and per email; CSRF protection via Origin validation.
- Multi-user projects and text files with optimistic concurrency: writes carry
  a base version and conflicting writes get `409`, never a silent overwrite.
- Project sharing by email with owner/editor/reader roles, enforced on every
  project route; project duplication; searchable and sortable project list.
- Project templates and ZIP import/export, including a tested migration path
  for Prism and Overleaf export archives.

**Compilation and editor**

- LaTeX compilation in a hardened, network-less container (latexmk + BibTeX)
  with bearer-token authentication, per-job timeouts and resource limits.
- Snapshots with `latexdiff` markup: manual versions, restore, and an automatic
  pre-restore snapshot to undo a bad restore.
- `chktex` linting, `texcount` word counts, and forward/inverse SyncTeX between
  the PDF and the source.
- CodeMirror 6 workspace: file tree, autosave with conflict handling, and a
  PDF panel where a click on the PDF jumps to the source line (and back).

**Literature and references**

- Multi-engine search across OpenAlex, Semantic Scholar and arXiv,
  deduplicated across sources (Crossref content arrives via OpenAlex).
- Connected-Papers-style similarity graph (bibliographic coupling + co-citation
  - direct-citation weighting) for any paper and for your own `.bib`, with
    prior/derivative panels, shortest-path highlighting, year timeline, labeled
    islands, and TikZ export.
- Full-screen literature explorer: list · graph · detail card; double-click any
  node to re-center the graph on it.
- Citation health panel: cited/defined counts, undefined keys, unused entries;
  conservative arXiv→published upgrade requiring title, author-family and year
  agreement before suggesting a replacement.
- BibTeX reader with per-entry source-line tracking and duplicate detection by
  DOI/title; Zotero library sync into the project `.bib`.
- Honest submission checklist and response-letter template.

**AI assistant (optional, provider-agnostic)**

- Works with any OpenAI-compatible API (Ollama, vLLM, Mistral, DeepSeek,
  OpenAI, OpenRouter, …); nothing AI-related is required to run Folio.
- Chat over the open document with streaming, persisted conversations, and LLM
  profiles encrypted at rest (AES-256-GCM).
- Writing agent with a citation contract: it only cites keys present in the
  project `.bib`, invented keys are filtered server-side, and it never edits
  the document without explicit confirmation.
- Section planner producing a sanitized JSON plan (persisted per project) with
  per-section drafts.
- Retrieval-augmented answers over your own documents: `.tex`/`.bib` chunking,
  pgvector storage (1536-dim provider embeddings), top-8 cosine retrieval
  injected into the chat context.

**Collaboration (opt-in, experimental)**

- Real-time co-editing via Yjs when `COLLAB_URL` is configured (feature is off
  by default), with room tokens signed per file/user and relay-side room
  verification.
- Collaborative undo (`Y.UndoManager`): Ctrl+Z reverts only your own edits,
  never remote participants' text.

**Platform**

- UI in Spanish, English and German; light/dark design tokens.
- Self-hosted stack via `docker-compose.yml`: pgvector Postgres, hardened
  compiler, optional collab relay and optional local Ollama.
- CI on GitHub Actions: format check, lint, typecheck, full test suite
  (unit + Postgres integration), build, and end-to-end tests against the real
  compiler container.

### Security

- Untrusted LaTeX never runs in the web process: a dedicated container with no
  network route to the Internet, read-only root filesystem, dropped
  capabilities, `no-new-privileges`, and memory/CPU/PID limits.
- Compiler hardening covered by e2e tests: bearer token required, `\write18`
  disabled, `\input` of system files rejected, path traversal and writes
  outside the job directory blocked, runaway jobs killed by timeout.
- Production Content-Security-Policy and security headers; `ALLOW_REGISTRATION=0`
  closes self-registration.
- Collab relay accepts only rooms whose name is signed in the presented token.
- HTTP rate limiting (global and login); LLM base URLs resolved and validated
  against private networks to block SSRF; LLM API keys sealed at rest.

### Fixed

No release precedes this one; the fixes below were caught and corrected during
development, before 0.1.0:

- `texEscape` now preserves `\`, `{` and `}` and balances braces instead of
  deleting them when generating `.bib` entries.
- Multi-word arXiv queries interpolate with AND instead of OR.
- The citation filter now covers the whole `cite` command family
  (`textcite`, `parencite`, …), not only plain `\cite`.
- The compiler reserves its concurrency slot before reading the request body
  (race that could exceed `MAX_CONCURRENT_JOBS` under bursts).
- Citing from the papers tab no longer discards unsaved `.bib` edits.
- Login rate limiting extended from per-IP to per-email as well.
- Collab client no longer sends a bodyless `POST` (415) that silently disabled
  collaboration.
- Collab tokens now sign the room/file, so a token for one file cannot open
  another room.
