# Roadmap

Honesty about limits is a project principle: this page lists what is done, what
is next, and what Folio does not do.

## Shipped

- Accounts, projects, files, autosave with optimistic concurrency
- Isolated compilation (`latexmk`, BibTeX/biber), errors linked to lines, `chktex` lint, `texcount`
- Exact SyncTeX in both directions
- Figures (PNG/JPG/PDF), eight templates, ZIP import (Prism, Overleaf, arXiv), PDF and ZIP export
- Unified literature search, citation health, submission check, recommendations, Zotero sync
- Connected-Papers-style literature explorer with timeline, islands and TikZ export
- Snapshots with latexdiff and restore
- Sharing with roles; experimental real-time collaboration (Yjs) with per-user undo
- Multi-provider AI with per-user sealed keys and task routing; assistant, RAG, drafting agent with
  section plan, critique and citation verification
- Review mode with scope, aspect and reviewer filters, verified locations
- Localised demo project, onboarding, browser-language detection (es/en/de)
- Installable PWA; Docker Compose and Dokploy deployments
- Inline comments anchored to quoted text (anchors survive edits), threaded across files
- Review mode v2: saved history, per-comment states, run-to-run comparison, fix-with-assistant handoff
- Response letter from reviewer comments (pasted or Folio reviews) with AI-drafted answers
- arXiv source export with TeX-faithful file closure and pre-flight checks
- Venue profiles in the submission check (NeurIPS, ICML, ACL, IEEE, Elsevier, LNCS, arXiv) with sourced rules
- Optional LanguageTool grammar checking mapped back to exact source lines
- Optional SMTP: password reset by e-mail and project invitations
- Personal PDF library with DOI detection, cite-into-project and RAG attach
- Self-adapting per-job bubblewrap sandbox in the compiler where the host allows it

## Next

1. **AI verified against real models.** A test battery against paid providers;
   today every AI path is tested against fake OpenAI-compatible servers.
2. **Venue-specific review checklists.** Review mode v2 already persists
   reviews, compares runs and hands comments to the assistant; what is left is
   checklists tailored per venue.
3. **Per-job compile isolation.** An ephemeral container or microVM per job
   (gVisor, Firecracker) instead of one shared, hardened container.
4. **DataCite cascade** for preprint → published upgrades (DOI → relations →
   arXiv `journal_ref` → OpenAlex merged records).
5. **OIDC / SSO**, quotas and an audit log.
6. **Observability** (OpenTelemetry, Langfuse) with no document content by default.
7. **DOCX export.**
8. **Multi-instance web** (shared rate-limit store).

## Known limits

- One web instance (rate limits live in memory).
- Compile jobs from different users share one container, sequentially, with a
  concurrency cap.
- Real-time collaboration is experimental and opt-in; it needs the relay behind
  `wss://`.
- RAG needs an embedding provider; cosine similarity is computed without an ANN
  index (enough at a project's scale).
- No password-reset e-mails; administrators reset passwords on the server.
- Local accounts only.
