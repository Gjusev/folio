# Security policy

## Reporting a vulnerability

Use **GitHub's private security advisories** for this repository (the
_Security_ tab → _Report a vulnerability_). Do not post details in issues. We
acknowledge reports within 5 business days and coordinate disclosure once a fix
is released.

## Threat model (summary)

| Surface               | Controls                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untrusted LaTeX       | Separate service on a network with no egress, read-only root filesystem, no capabilities, memory/PID/time limits, no `\write18`, `openin_any=p`/`openout_any=p`, `latexmk -norc`, validated paths. End-to-end tests in CI |
| Data access           | Every query is scoped to the owner or a project member; other users' ids answer 404. Viewers cannot write                                                                                                                 |
| Sessions              | Random 256-bit token, only its SHA-256 stored. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` in production                                                                                                                  |
| Passwords             | scrypt (N=2^17, r=8, p=1) with salt and constant-time comparison                                                                                                                                                          |
| CSRF                  | `Origin` check on mutating methods, JSON bodies required, `SameSite=Lax`                                                                                                                                                  |
| Abuse                 | Rate limits on login (per IP and per e-mail), registration, compilation, imports, search, AI, review and sharing; client IP taken from the last `X-Forwarded-For` entry                                                   |
| AI (prompt injection) | The model has no tools or permissions; the document is marked as data; changes require user confirmation; cite keys and review locations are verified on the server                                                       |
| Provider keys         | Per user, sealed with AES-256-GCM, never returned to the browser; the server-wide key can be withheld (`LLM_ENV_SHARED=false`)                                                                                            |
| SSRF                  | Search APIs use fixed hosts and validated ids. User provider URLs are resolved and rejected if they point to loopback/private ranges (unless explicitly allowed); redirects are refused                                   |
| ZIP import            | Limits before and after decompression (50 MB), paths validated like any project file, formats checked by byte signature; nothing from the ZIP touches the app's disk                                                      |
| Served figures        | Only formats verified at upload; responses carry `Content-Security-Policy: sandbox`                                                                                                                                       |
| Live collaboration    | Room tokens signed with HMAC and bound to project, user and file; the relay closes connections whose room does not match the token                                                                                        |
| Browser               | Production CSP, `X-Frame-Options: SAMEORIGIN`, `nosniff`, a restrictive `Permissions-Policy`                                                                                                                              |

Known limits: rate limiting is kept in memory (one web instance), and compile
jobs from different users share one hardened container, sequentially. See
[docs/architecture.md](docs/architecture.md#the-latex-compiler-sandbox).
