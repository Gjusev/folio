# Audits of November 2026

On 3 November 2026 five independent reviews audited Folio before its first
public release: product and competition, the live UI (16 screenshots), the
citation-graph visualisation, code correctness, and application security. Every
finding was checked against the code by its reviewer; one was refuted when
reproduced live ("Recommended → 404": the endpoint answered 200).

**Totals:** 35 verified findings, 7 test gaps, 10 ranked product improvements.
**Status:** every P0, P1 and P2 item below was fixed in the following days and
is covered by tests; the P3 items shipped later or are on the
[roadmap](../roadmap.md). The detailed review notes live in the git history.

## P0 — verified bugs (fixed)

| Finding                                                                                                | Severity | Fix                                                                                  |
| ------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------ |
| Multi-word arXiv search was parsed as OR (`+AND+` encoded as `%2B`): 690,406 results instead of 19,417 | Critical | Real `AND` join, with a test of the exact query string                               |
| Silent `.bib` loss: unsaved local edits + "Cite" → the debounced save wiped the entry just added       | High     | Flush before citing; a dirty document raises a conflict instead of rebasing silently |
| Compiler `MAX_JOBS` race: the check ran before reading the body, so bursts started N `latexmk`s        | High     | Slot reserved before any `await`, released in `finally`                              |
| Rate-limit bypass via `X-Forwarded-For` (first, client-controlled entry was used)                      | High     | Last entry + a per-e-mail login limit                                                |
| Export/versions/log popovers did not close on outside click and overlapped                             | High     | Shared outside-click/Escape hook                                                     |
| Assistant tab unreachable on phones                                                                    | High     | Added to the mobile tab list                                                         |
| `enforceCiteKeys` let `\textcite`/`\parencite` with invented keys through (biblatex)                   | Medium   | One cite-command regex shared with citation health                                   |
| `texEscape` deleted `\`, `{`, `}` instead of escaping them (titles with math were corrupted)           | Medium   | Real escaping, braces balanced, tested with `$\alpha$`                               |
| Console errors: sigma mounted with no size; 405/404 on file routes                                     | Medium   | Measured mount; routes fixed                                                         |

## P1 — graph, design and security polish (fixed)

- **Graph:** selection always highlighted, camera animated to the node, hover
  tooltip; a monotonic-luminance year ramp (readable in greyscale and with
  colour blindness) with a gradient legend; a seeded layout so TikZ exports are
  reproducible; area-faithful node sizes and first-author labels in TikZ.
- **Design:** monochrome icons with labels, loading skeletons, a shared select
  component, inline restore confirmation, editable-title affordance.
- **Security/operations:** DNS-resolving SSRF guard for provider URLs (private
  ranges rejected unless allowed for Ollama), `ALLOW_REGISTRATION`, mandatory
  `POSTGRES_PASSWORD`, resource limits and dropped capabilities in Compose, a
  production CSP, the assistant stream aborted on unmount.

## P2 — product (shipped)

Prism migration route with a fixture-based end-to-end test; `chktex` and
`texcount`; persisted AI conversations; duplicate and search projects; sharing
with roles; a submission checklist; exact SyncTeX; a response-letter template;
Zotero sync.

## P3 — large items

Real-time collaboration (shipped, experimental), graph islands (shipped), RAG
(shipped; needs an embedding provider), a battery against paid models (open).

**Guiding principle (from the product audit):** honesty as the differentiator —
no invented statistics, adoption measured with verifiable signals.
