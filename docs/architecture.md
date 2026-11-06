# Architecture

Folio is one TypeScript web application plus two small services. This document
describes what runs where, the decisions behind it, and the security model of
the part that executes untrusted input: the LaTeX compiler.

## Components

```
browser ──HTTPS──▶ web (Next.js 16: UI + API) ──▶ Postgres 17 + pgvector
   │                  │
   │                  ├──HTTP + bearer token──▶ latex-compiler   (internal network, no egress)
   │                  └──HTTPS──▶ OpenAlex · Semantic Scholar · arXiv · Zotero · your LLM provider
   │
   └──WSS (opt-in)──▶ collab relay (Yjs fan-out, HMAC-signed room tokens)
```

| Component                 | What it does                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `web`                     | Pages and the JSON API (route handlers), sessions, authorization, persistence, AI orchestration |
| `services/latex-compiler` | `latexmk`, `latexdiff`, `chktex`, `texcount` and SyncTeX behind a token-protected HTTP API      |
| `services/collab`         | Optional WebSocket relay for live editing; carries Yjs updates and cursors, never keys          |
| Postgres                  | Users, projects, files (text and binary), snapshots, AI history, provider profiles, RAG chunks  |

## Stack and why

| Area        | Choice                                                                              | Why                                                                    |
| ----------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Language    | TypeScript, `strict`                                                                | One language across UI, API and services                               |
| Web and API | Next.js 16 (App Router, route handlers), React 19, React Compiler                   | One deployable for UI and API                                          |
| Styling     | Tailwind CSS 4 with project tokens (`src/app/globals.css`)                          | No component library to fight                                          |
| Database    | PostgreSQL 17 with pgvector                                                         | Relational data and embeddings in one place                            |
| ORM         | Drizzle ORM + drizzle-kit, versioned SQL in `drizzle/`                              | Typed queries, reviewable migrations, applied on start-up              |
| Validation  | Zod at every boundary (API bodies, environment)                                     |                                                                        |
| Auth        | Database sessions: random 256-bit token, only its SHA-256 stored; scrypt            | Small, auditable surface; OIDC is on the roadmap                       |
| Editor      | CodeMirror 6 (`stex` mode), Yjs binding for collaboration                           | Mature, light, MIT                                                     |
| PDF         | react-pdf with a self-hosted worker (no CDN)                                        | Continuous pages, click-to-source                                      |
| Graph       | graphology + sigma.js v4, ForceAtlas2 per connected island                          | WebGL rendering of a few hundred nodes                                 |
| AI          | Own streaming client for OpenAI-compatible APIs and Anthropic's Messages API        | Any provider without an SDK; the UI never knows which one is behind it |
| Tests       | Vitest (integration against real Postgres, fake LLM servers in process), Playwright | Real seams, no mocks of our own code                                   |

The original brief proposed Next.js **and** FastAPI, Overleaf Community Edition
as the editor, and a production-grade stack (Keycloak, Qdrant, MinIO, Langfuse,
vLLM) for a first version. Folio deliberately took the smaller path: one
TypeScript app, an own editor (no AGPL code in an Apache-2.0 product), an own
isolated compiler (Overleaf CE does not isolate compiles), API-first AI with
local models as an option, and pgvector instead of a separate vector database.
The interfaces were kept ready for the bigger pieces (sessions replaceable by
OIDC, OpenAI-compatible gateway, Postgres with pgvector).

## Data model

| Table                        | Holds                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `users`, `sessions`          | Accounts (scrypt hashes) and session token hashes                                   |
| `projects`                   | Name, main file, AI steering (instructions, style sample), the agent's section plan |
| `files`                      | Path, text content or binary (`bytea`), size, optimistic-concurrency `version`      |
| `project_members`            | Sharing: `editor` or `viewer` per user                                              |
| `snapshots`                  | Labelled copies of the text files, for diff and restore                             |
| `comments`                   | Threaded comments on a file selection (`anchor_start/end/quote`), resolve state     |
| `ai_messages`                | Persisted assistant conversations (trimmed to the latest 200 per project)           |
| `llm_profiles`, `llm_routes` | Per-user providers (keys sealed with AES-256-GCM) and task → profile routing        |
| `rag_chunks`                 | Paragraph and `.bib`-entry chunks with `vector(1536)` embeddings                    |
| `integrations`               | Per-user Zotero credentials, sealed like provider keys                              |

Every query that touches a project goes through `getViewableProject`,
`getEditableProject` or `getOwnedProject` (`src/lib/projects.ts`). A stranger's
id answers 404, the same as a missing one.

## Key modules

| Path                                                            | Responsibility                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/http.ts`                                               | `route()` wrapper, Origin check, JSON parsing, rate limits, client IP                 |
| `src/lib/projects.ts`                                           | Projects, files, members, snapshots, access checks                                    |
| `src/lib/importer.ts`                                           | ZIP import (Prism, Overleaf, arXiv) with size and path checks                         |
| `src/lib/compiler.ts`                                           | Client of the compile service (compile, diff, lint, count, SyncTeX)                   |
| `src/lib/papers.ts`, `citation-graph.ts`, `graph-similarity.ts` | Search, the citation graph engine and the similarity model                            |
| `src/lib/ai-prompts.ts`, `llm.ts`, `llm-profiles.ts`            | Prompts and their contracts, streaming, provider resolution                           |
| `src/lib/review.ts`                                             | Review mode: sections, excerpt, prompt, verification of the model's answer            |
| `src/lib/demo.ts`, `templates.ts`                               | The localised demo project and the templates                                          |
| `src/lib/i18n/`                                                 | Dictionaries (es/en/de) and language negotiation                                      |
| `src/lib/brand.ts`                                              | Colours, mark geometry and wordmark outlines shared by the UI and the asset generator |

## Internationalisation

UI strings live in typed dictionaries (`src/lib/i18n/*-dict.ts`); Spanish is the
source of truth and English/German are typed against it, so a missing key fails
the typecheck. The language is the `folio_lang` cookie when the user picked one,
otherwise the browser's `Accept-Language` (es, en, de), otherwise English. API
errors carry stable messages that the client maps to the user's language.

## The LaTeX compiler sandbox

Threat: a malicious `.tex` that tries to read files (`\input{/etc/passwd}`), run
commands (`\write18`), exhaust resources (infinite loops) or exfiltrate data.

1. **Process and network separation.** The compiler is its own container on a
   network marked `internal: true`, with no route to the internet. Only the web
   app can reach it, and it authenticates with `COMPILER_TOKEN`.
2. **Container hardening.** Unprivileged user, read-only root filesystem, `/tmp`
   on a size-limited tmpfs, `cap_drop: ALL`, `no-new-privileges`, memory, PID and
   CPU limits.
3. **Per job.** A fresh temporary directory removed afterwards, `-no-shell-escape`,
   `openin_any=p` and `openout_any=p` (TeX cannot read or write outside the job
   directory), `latexmk -norc`, a timeout that kills the whole process group,
   limits on file count, file size and PDF size, validated paths (no `..`, no
   absolute paths), and a concurrency cap that answers 429 when full (the slot is
   reserved before the request body is read).
4. **Verified in CI.** The compiler's end-to-end suite builds the real image and
   checks each control (shell escape, `/etc/passwd`, writing outside the job,
   infinite loops, wrong token), and that every template and the demo project
   compile with resolved citations.

### Compile isolation (per-job namespaces)

The threat model above assumes users are untrusted: `latexmk` executes TeX code
they wrote, so the controls in point 3 are permission-level (TeX refuses to
open paths outside the job directory). Since jobs from different users share
the container, one after another, they add a namespace boundary: when the host
allows it, every tool spawn (`latexmk`, `chktex`, `texcount`, `synctex`,
`latexdiff`) is wrapped in [bubblewrap](https://github.com/containers/bubblewrap)
— `bwrap --unshare-all --die-with-parent --new-session` with the whole root
read-only, a fresh private `/tmp` and the job directory as the only writable
path. One job cannot even **see** another job's files, and there is no network,
no IPC and no other writable path inside the sandbox at all.

This is self-adapting: a one-shot boot probe runs the exact production wrap
with `/usr/bin/true`; if the kernel or the container's seccomp profile does not
allow user namespaces, the service logs one line (`isolation=none reason=…`,
with the kernel release and the userns sysctl) and keeps today's behavior —
compilation never depends on the sandbox being available. `/health` reports the
active mode (`isolation: "bwrap" | "none"`, additive field).

Where Docker's default seccomp profile blocks user namespaces,
`deploy/seccomp-compile-userns.json` is staged as a fallback of last resort: a
deliberately allow-all profile (a real weakening of the container) justified
only because every job then runs in its own namespace sandbox. It is not wired
into any compose file; the operator wires it onto the compiler service only if
the production boot probe reports `isolation=none` for that reason
(`deploy/seccomp-README.md`).

Remaining limit: jobs still share one kernel. A container escape or a kernel
vulnerability is out of scope for bubblewrap; the planned deeper upgrade
remains an ephemeral container or microVM per job (gVisor, Firecracker).

## Design system

The app uses a "framed sheet" layout: a warm stone frame, the work (source and
PDF) on white sheets, depth from one tone step instead of shadows, and colour
reserved for data and selection. Type is IBM Plex Sans for the interface and
IBM Plex Mono for code; the brand (logo, landing page) uses Switzer. See
[brand-guidelines.md](brand-guidelines.md).
