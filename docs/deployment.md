# Deployment

Folio ships as a Docker Compose stack: Postgres (with pgvector), the isolated
LaTeX compiler, the optional collaboration relay and the web app. Migrations
run when the web container starts.

## Docker Compose (any server)

```bash
git clone https://github.com/Gjusev/folio.git && cd folio
cp .env.example .env    # set the required variables below
docker compose --profile app up -d --build
```

The web app listens on `127.0.0.1:3000` only. Put a TLS reverse proxy (Caddy,
nginx, Traefik) in front of it; session cookies are marked `Secure` in
production. The compiler sits on an internal network with no internet access
and is reachable only from the web container.

First build of the compiler image installs TeX Live from Debian and takes a few
minutes; later builds are cached.

## Dokploy (or any Traefik-based platform)

`docker-compose.dokploy.yml` is the same stack without host-published ports and
without profiles, so Traefik routes by domain:

1. Create a Compose service from the repository with **Compose path**
   `./docker-compose.dokploy.yml`.
2. Set the environment (see the reference below). At minimum:
   `POSTGRES_PASSWORD`, `COMPILER_TOKEN`, `COLLAB_SECRET`, `LLM_CREDENTIALS_KEY`,
   `APP_URL`.
3. Add domains: `web` on port **3000** (e.g. `folio.example.org`) and, for live
   collaboration, `collab` on port **3001** (e.g. `collab-folio.example.org`),
   both with HTTPS. Then set `COLLAB_URL=wss://collab-folio.example.org`.
4. Deploy.

The networks declare explicit subnets (`10.213.0.0/24`, `10.213.1.0/24`)
because busy Docker hosts can run out of default address pools ("all predefined
address pools have been fully subnetted"). Change them if they collide with
something on your host.

## Environment reference

| Variable                                     | Required    | Default                 | Purpose                                                                                      |
| -------------------------------------------- | ----------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                          | yes         |                         | Database password (must match the one the data volume was initialised with)                  |
| `COMPILER_TOKEN`                             | yes         |                         | Shared secret between web and compiler; also signs collab tokens if `COLLAB_SECRET` is unset |
| `DATABASE_URL`                               | dev only    |                         | Set by Compose in containers; needed when running `pnpm dev` on the host                     |
| `COMPILER_URL`                               | dev only    |                         | `http://127.0.0.1:3001` in development; set by Compose in containers                         |
| `APP_URL`                                    | prod, mail  | `http://localhost:3000` | Public origin for absolute links (Open Graph image, e-mail links). Required for e-mail       |
| `SMTP_URL`                                   | no          | empty                   | SMTP as one URL (`smtps://user:pass@host:465`); empty (and no `SMTP_HOST`) turns e-mail off  |
| `SMTP_HOST`, `SMTP_PORT`                     | no          | empty, `465`            | SMTP as discrete values; `465` uses implicit TLS, other ports STARTTLS. `SMTP_URL` wins      |
| `SMTP_USER`, `SMTP_PASS`                     | no          | empty                   | SMTP credentials for the discrete form, taken verbatim (no URL-encoding)                     |
| `SMTP_FROM`                                  | no          | see below               | Sender address; default `SMTP_USER` if it is an address, else `no-reply@` the `APP_URL` host |
| `ALLOW_REGISTRATION`                         | no          | `1`                     | `0` closes self-registration; existing accounts keep signing in                              |
| `COLLAB_URL`                                 | no          | empty                   | WebSocket URL the browser uses for live collaboration; empty turns it off                    |
| `COLLAB_SECRET`                              | no          | `COMPILER_TOKEN`        | HMAC key for collaboration room tokens (give the relay the same value)                       |
| `LLM_CREDENTIALS_KEY`                        | for AI keys |                         | Encrypts per-user provider keys at rest; rotating it means users re-enter their keys         |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`   | no          | empty                   | A server-wide OpenAI-compatible endpoint                                                     |
| `LLM_ENV_SHARED`                             | no          | `true`                  | `false`: nobody uses the server-wide key; each user brings their own                         |
| `LLM_ALLOW_LOCAL`, `LLM_ALLOWED_LOCAL_PORTS` | no          | off, `11434`            | Let user profiles point at loopback/private hosts (e.g. Ollama)                              |
| `OPENALEX_MAILTO`                            | no          | empty                   | Contact e-mail for OpenAlex's polite pool                                                    |
| `OPENALEX_API_KEY`                           | no          | empty                   | A free OpenAlex key so the instance has its own daily budget                                 |
| `LANGUAGETOOL_URL`                           | no          | empty                   | LanguageTool server for grammar checking (see below); empty turns it off                     |
| `RATE_LIMIT_MULTIPLIER`                      | no          | `1`                     | Multiplies every rate-limit ceiling. For test stacks only; raising it lowers your protection |
| `NEXT_PUBLIC_REPO_URL`                       | no          | empty                   | Link to the source shown in the landing footer (build-time)                                  |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Grammar checking (LanguageTool)

Optional and off by default. The Lint button then runs chktex alone and says
grammar checking is not configured. To turn it on:

1. Start the bundled LanguageTool service, which sits behind the `grammar`
   Compose profile: `docker compose --profile grammar up -d languagetool`
   locally, or `COMPOSE_PROFILES=grammar` in the Dokploy environment.
2. Set `LANGUAGETOOL_URL=http://languagetool:8010` for the web container
   (`http://127.0.0.1:8010` when running `pnpm dev` on the host) and redeploy.

The service is the community `erikvl87/languagetool` image (the LanguageTool
project publishes no official one), capped at 1 GB of memory with a 768 MB Java
heap. In Dokploy it sits on an internal network with no published port and only
the web app can reach it. The web app does not depend on it: if it is stopped
or slow, Lint shows a short note and keeps the chktex results. Only prose
leaves the web app (LaTeX commands, math and comments are stripped first), and
it goes to your own LanguageTool server, never to a third party. The first check
after a start takes about 30 s while the JVM warms up. Each check covers up to
30 `.tex` files (main file first) and returns at most 100 issues.

## E-mail (optional)

Off by default: with neither `SMTP_URL` nor `SMTP_HOST` set, Folio sends no
e-mail and behaves as before. With SMTP configured it enables:

- **Password reset by e-mail.** The login page shows "Forgot your password?";
  `/forgot` mails a link to `/reset`. Tokens are random, stored only as a
  SHA-256 hash, valid for 30 minutes and single-use; asking again invalidates
  the previous link. A successful reset signs the user out of every session and
  does not log them in. `/forgot` answers the same whether the account exists or
  not, and is rate-limited per IP and per address.
- **Invitation e-mails.** Sharing a project with an existing account also mails
  the new member a link to it (role changes send nothing). Sharing with an
  address that has no account is still refused.

`pnpm reset-password` keeps working either way and stays the rescue path.

Two ways to configure the server, pick one (`SMTP_URL` wins if both are set):

```bash
# One URL. Special characters in the user or password must be URL-encoded.
SMTP_URL=smtps://folio%40example.org:secret@smtp.example.org:465
# Discrete values, taken verbatim: recommended when the password has
# characters such as @ # : / ? %.
SMTP_HOST=smtp.example.org
SMTP_PORT=465            # 465 = implicit TLS; 587 = STARTTLS
SMTP_USER=folio@example.org
SMTP_PASS=p@ss#word
```

Mind the `$`: Compose interpolates env values, so a literal `$` in `SMTP_PASS`
is silently truncated (verified with `docker compose config`: `pa$w0rd` reaches
the container as `pa`). In Compose env files write `$$`, or wrap the value in
single quotes; `#` needs no quoting. `pnpm dev` on the host takes the value
verbatim.

`APP_URL` is **required** for e-mail: links are built only from it, never from
the request's `Host` header. In production, SMTP with an empty `APP_URL` keeps
e-mail off and logs `SMTP set but APP_URL empty: mail disabled`. Many
providers reject a sender other than the authenticated mailbox, which is why
`SMTP_FROM` defaults to `SMTP_USER` when that is an address.

## Venue profiles

The submission checklist's venue profiles (NeurIPS, ICML, ACL, IEEE, Elsevier,
LNCS, arXiv) are **versioned local data** (`VENUES_VERSION` in
`src/lib/venues.ts`), not a service: there are no network calls at runtime, and
every rule (page limit, review model, bib style, required sections) carries its
official `sourceUrl` and `verifiedAt` in the same file. Re-verify those URLs
when updating a value and bump `VENUES_VERSION`; nothing else needs deploying.

## Operations

- **Public instance checklist.** Set `ALLOW_REGISTRATION=0` once your accounts
  exist; set `LLM_ENV_SHARED=false` if the server has an LLM key; set `APP_URL`.
- **Password reset.** Without SMTP there is no e-mail flow; with it, see
  [E-mail](#e-mail-optional). Either way an administrator can reset a password
  on the server: `pnpm reset-password user@example.org` (or the same script
  inside the web container).
- **Upgrades.** Pull, rebuild, restart. Migrations are applied by the web
  container on start-up; never apply migration SQL by hand, or drizzle's journal
  will disagree with the schema.
- **Backups.** Everything lives in the Postgres volume (`pgdata`): back it up
  with `pg_dump` or your platform's database backups.
- **Scaling limits.** Rate limits are kept in memory, so run one web instance.
  The compiler runs `MAX_CONCURRENT_JOBS` (default 2) at a time and answers 429
  beyond that.
- **Consumer AI subscriptions** (ChatGPT Plus, Claude Pro, Gemini AI Pro) cannot
  be used by an app; Folio needs API keys.
