# Folio — Master Plan (Nov 2026 → Jan 2027)

> **For agentic workers:** this is the index. Each phase below is its own
> sub-project. Before implementing a phase, write its detailed plan with
> superpowers:writing-plans (save as
> `docs/superpowers/plans/YYYY-MM-DD-<phase>.md`), then execute it with
> superpowers:subagent-driven-development or superpowers:executing-plans.
> Phase 0 already has its detailed plan:
> [`2026-11-04-phase-0-operations.md`](2026-11-04-phase-0-operations.md).

**Goal:** take Folio from "deployed and tested" to "released, safe to run for
others, and clearly better than the alternatives for writing and submitting a
paper" before Prism closes on 2027-01-01.

**Guiding rules (apply to every phase):**

- Honesty about limits: no invented numbers; every claim in the docs is checked.
- TDD for logic; Playwright e2e for every user-facing flow; the compiler keeps
  its isolation e2e green.
- Every string in es/en/de (`src/lib/i18n/`), Spanish is the typed source.
- AI never edits without confirmation and never invents cite keys.
- Production = Dokploy compose `UACGsfIaf5WFrYVtxBP6x` (app `folio-gqx9al`),
  <https://folio.mokka-dev.de>. Redeploy = push to `master`, then
  `compose-deploy`. After each deploy run `E2E_BASE_URL=https://folio.mokka-dev.de COLLAB_URL=wss://collab-folio.mokka-dev.de pnpm e2e`.
- Commits end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Timeline

| Phase | Window (2026)      | Sub-project                                   | Depends on                 |
| ----- | ------------------ | --------------------------------------------- | -------------------------- |
| 0     | Nov 5 – Nov 7      | Operations foundation + real-model AI check   | —                          |
| 1     | Nov 9 – Nov 14     | Public release v0.1.0                         | 0                          |
| 2     | Nov 16 – Nov 28    | arXiv-ready export · anchored comments        | 1                          |
| 3     | Nov 30 – Dec 12    | Review mode v2 · review → response letter     | 0 (AI check), 2 (comments) |
| 4     | Dec 14 – Dec 23    | Venue profiles · LanguageTool · optional SMTP | 1                          |
| 5     | parallel, Nov 16 → | Per-job compile isolation (spike → build)     | 0                          |
| 6     | Dec 28 – Jan 1     | Prism-closing push: v0.2.0, migration guide   | 2, 3                       |

---

## Phase 0 — Operations foundation (detailed plan exists)

**Why first:** production has **no database backups** (Dokploy lists none for
the compose), there is no health endpoint for monitoring (`/api/health` answers
404), e2e test accounts live in the production database, and no AI feature has
ever run against a real model.

**Scope:** `/api/health` + container healthcheck; account purge script;
backups to S3-compatible storage with a restore drill; uptime and deploy
notifications; AI smoke battery against a real provider; registration policy.

**Acceptance:** a backup exists off-host and a restore was rehearsed; an alert
reaches the owner when `/api/health` fails; test accounts are gone; the review
mode, drafting agent and assistant have each produced a valid result from a
real model, with fixes committed for whatever broke.

**Inputs needed from the owner:** S3-compatible bucket credentials (endpoint,
bucket, access key, secret, region); one AI provider key; a notification
channel (e-mail/Telegram/Discord/Slack webhook).

---

## Phase 1 — Public release v0.1.0

**Scope**

1. Release workflow `.github/workflows/release.yml`: on tag `v*`, build the web
   image multi-arch and push to `ghcr.io/gjusev/folio` (+ compiler and collab
   images), attach the CHANGELOG section to a GitHub Release.
2. `docker-compose.release.yml`: the stack from published images (no build), so
   self-hosting is `curl` the file + `.env` + `docker compose up -d`.
3. Final secret sweep (RELEASE.md §0), repository made public, social preview
   uploaded, branch renamed to `main`.
4. Landing footer: set `NEXT_PUBLIC_REPO_URL` (build arg) so "Apache-2.0" links
   to the repository.
5. Announcement drafts (r/LaTeX, Show HN, r/selfhosted) with the "not in this
   release" list verbatim; owner posts them.

**Acceptance:** a clean machine reaches a compiling demo project with three
commands from the README using only published images; CI green on `main`; tag
`v0.1.0` signed; GitHub Release published.

**Files:** `.github/workflows/release.yml`, `docker-compose.release.yml`,
`Dockerfile` (build arg), `README.md`, `RELEASE.md`, `CHANGELOG.md`.

---

## Phase 2a — arXiv-ready export

**Why:** preparing an arXiv submission (flattening, `.bbl`, removing comments
and unused files, checking arXiv's rules) is a universal pain no rival solves.

**Scope**

1. Compiler endpoint `/arxiv`: compile, then produce a ZIP with flattened
   `\input`/`\include` (or kept files when flattening is unsafe), the generated
   `.bbl` included, comments stripped (keeping `%` inside verbatim/url),
   unreferenced files dropped, `00README.json` with the main file and processor.
2. Pure checks in `src/lib/arxiv-check.ts` with tests: file names (no spaces or
   non-ASCII), total size limit, figure formats for pdflatex, `\pdfoutput=1`
   within the first lines, no absolute paths, no `\write18`, biblatex requiring
   `.bbl` version matching arXiv's TeX Live (warn).
3. UI: Export menu → "arXiv package…" dialog listing the checks (pass/warn/fail)
   and the files to be included; download.

**Acceptance:** for every template and the demo project, the package compiles
in a clean container with only its own files; checks are unit-tested; e2e
downloads a package and inspects its file list.

---

## Phase 2b — Anchored comments between co-authors

**Scope**

1. Table `comments` (migration via `pnpm db:generate`): `id, project_id,
file_id, author_id, anchor (start/end offsets + quoted text), body,
parent_id, resolved_at, created_at`. Anchors are re-located by quoted text
   when offsets drift (pure function, tested).
2. API `/api/projects/[id]/comments` (list/create/reply/resolve/reopen/delete own);
   viewers may comment, only editors resolve.
3. Editor: CodeMirror decorations for anchored ranges, a gutter marker, a
   comments panel (threads, resolve, jump), "Comment" on selection.
4. Collaboration: comment changes broadcast through the existing relay as a
   lightweight "refresh" message (no content in the relay).

**Acceptance:** two users comment, reply and resolve on the same file; anchors
survive edits around them; strangers get 404; e2e covers the thread lifecycle.

---

## Phase 3a — Review mode v2

**Scope**

1. Persist reviews server-side (table `reviews`: project, user, options, result
   JSON, created_at); the panel lists past reviews; the browser cache becomes a
   fallback.
2. Comment states: open / resolved / dismissed, stored per review.
3. "Fix with the assistant": sends the comment, its quote and location as an
   instruction to the assistant (the assistant proposes; nothing applied
   automatically).
4. Compare two reviews: resolved since, new, still open (matched by aspect +
   location + similar quote — pure function, tested).
5. Prompt tuning from Phase 0's real-model results.

**Acceptance:** reviews survive reload and devices; comparing shows correct
deltas on fixtures; e2e for resolve + fix-with-assistant handoff.

## Phase 3b — Review → response letter

**Scope:** turn review comments — from Folio's review **or pasted text from a
real journal's reviewers** — into the `response-letter` template: one item per
comment (quote, response placeholder for the author, link to the changed
lines), plus a latexdiff of the revision against a chosen snapshot. Parsing
pasted reviews into numbered points is a pure, tested function; AI may suggest
draft responses, marked as drafts.

**Acceptance:** from a pasted three-point review, the letter compiles with three
items; with a snapshot selected, the letter's appendix links the diff.

**Status: DONE (2026-11-06, 419d16e).** `src/lib/letter.ts` (pure: escapeLatex,
parsePastedReview, itemsFromFolioReview, buildResponseLetter, draft
messages/parse), `POST /api/projects/[id]/letter` (upsert of
`response-letter.tex`), `/letter/drafts` (AI drafts, ids not in input dropped),
`/compile` gains an optional `mainFile` (bodyless callers unchanged), and a
collapsible "Carta de respuesta" section in ReviewPanel. Acceptance verified in
production (letter of 3 pasted points compiles, `pages=1`; snapshot → appendix
names it; upsert bumps version; bad mainFile → 400). 27 unit + 3 e2e specs;
adversarial pass fixed one defect (dangling empty point marker blocked
creation). The latexdiff itself is the existing snapshot diff route; the letter
appendix references it.

---

## Phase 4a — Venue profiles

**Scope:** a small, versioned data file of venues (NeurIPS, ICML, ACL, IEEE
conference, Elsevier, Springer LNCS, arXiv) with page limit, anonymisation rule,
required sections and bibliography style; the submission check gains a venue
selector: page count from the compiled PDF, author names/affiliations in the
source for blind review, missing required sections. Only rules we can verify
from the venue's public author guidelines, each with its source URL.

**Status: DONE (2026-11-06, 5a1995c).** `src/lib/venues.ts` (VENUES_VERSION=1;
each rule carries sourceUrl + verifiedAt; all 7 sources opened one by one, ICML
2025 anonymisation and LNCS page scope corrected from the official pages, IEEE
left declared-unverified behind bot protection). `?venue=` on the submission
check adds pages (best-effort compile, neutral degradation), blind signals
(double-blind only, honest heuristic), required sections and bib style; without
a venue the response is byte-identical to before. Verified in production
(demo article: pages=2 vs ACL's 8, Limitations flagged; arXiv adds nothing
style-related).

## Phase 4b — LanguageTool (grammar without AI)

**Scope:** optional `languagetool` service in compose (official open-source
server image, internal network); `/api/projects/[id]/grammar` sends prose only
(LaTeX commands, math and comments stripped with an offset map so findings map
back to source lines — pure function, tested); results appear in the issue list
next to chktex. Off when `LANGUAGETOOL_URL` is empty.

**Status: DONE (2026-11-06, 874065d).** `src/lib/latex-prose.ts` records the
source index of every output character, so findings map back to the exact line
whatever the extraction rules do (37 tests + 300-document fuzz). The grammar
route fails fast on a dead server (one request), and a 60 s run budget cuts a
slow-but-alive one. chktex results render before grammar. The compose service is
`erikvl87/languagetool:6.8` (LanguageTool publishes no official image), behind
`profiles: [grammar]`. Verified end to end against a REAL LanguageTool locally:
the issue is shown and clicking it jumps to the right line. Production is
deployed OFF (to enable: `COMPOSE_PROFILES=grammar` +
`LANGUAGETOOL_URL=http://languagetool:8010`, about 1 GB RAM).

## Phase 4c — Optional SMTP

**Scope:** `SMTP_URL` (empty = off, today's behaviour). When set: password reset
by e-mail (single-use, 30-minute, hashed tokens), invitation e-mails for shared
projects, rate limits. `pnpm reset-password` stays.

**Acceptance for 4a–4c:** each is off/neutral by default, documented in
`docs/deployment.md`, and covered by unit + e2e tests.

**Status 4c: DONE (2026-11-06, 6f5c9c8), and ENABLED in production** (netcup
SMTP via the discrete SMTP_HOST/PORT/USER/PASS form; the password's `#` needs
no quoting in compose, `$` would need single quotes — documented). Reset
tokens: single-use atomic UPDATE, 30 min, sha256 at rest, one clock (the
DB's), and a reset revokes every session. No account enumeration by response
or by TIMING (measured 6x before, 0.1 ms = 0.1 ms after). Reset links build
only from APP_URL. Invite mails escape everything and never block the share;
sendMail rejects CRLF recipients (proven injection at the nodemailer boundary).
Full e2e against a fake SMTP plus a real-delivery probe in production.

---

## Phase 5 — Per-job compile isolation

**Why:** today all users' jobs run sequentially in one hardened container.
Before running Folio as an open, multi-user public service, each job should get
its own sandbox.

**Spike (2 days, decide with evidence):**

1. nsjail/bubblewrap inside the compiler container (user namespaces; check what
   the Dokploy host's kernel and Docker seccomp profile allow);
2. gVisor (`runsc`) as the compiler container's runtime (needs host install);
3. an ephemeral container per job via a minimal, socket-proxied Docker API
   (riskier: never mount the raw Docker socket).

Pick the first that runs on the production host without weakening the host.
Write the decision into `docs/architecture.md`, then build it with the existing
isolation e2e suite extended: one job cannot see another job's files or
processes, even concurrently.

**Status: DONE as far as this host allows (2026-11-06, 213d6ff + f0b6c88 reverted d1e8f7f).**
Spike evidence per the plan's own method: kernel 6.1 Debian 12 with userns
enabled, but Docker's default seccomp blocks clone(NEWUSER). The compiler now
carries a self-adapting bubblewrap sandbox (boot probe; per-job namespaces
when the host allows; today's hardening otherwise; /health reports the mode).
The staged allow-all seccomp profile was wired once with owner approval: the
probe then died at `bwrap: Failed to make / slave` (the host forbids the
mount-propagation change from inside), so the trade bought nothing and the
default filter was restored the same day. Production runs `isolation=none`
= the pre-existing hardening (uid 1000, cap_drop ALL, read-only rootfs,
tmpfs, internal network, openin/openout_any, shell_escape off), verified
with a real compile after the revert. gVisor needs a host install (no host
access) and nsjail shares bwrap's mount-ns requirement. Evidence trail:
deploy/seccomp-README.md. The sandbox activates by itself on any future
host that permits it.

---

## Phase 6 — Prism-closing push (Dec 28 – Jan 1)

Release v0.2.0 with Phases 2–4, a "Moving from Prism" guide in `docs/`, a
refreshed landing (the countdown reaches zero and switches to "Prism has
closed" automatically — already implemented), announcement update.

---

## Monitoring (spans phases)

- Phase 0: health endpoint, container healthcheck, uptime alerts, Dokploy
  deploy-failure notifications.
- Phase 4: self-hosted error tracking (GlitchTip, Sentry-compatible) behind an
  `ERROR_TRACKING_DSN` that is empty by default, with document content scrubbed.
