# Releasing Folio — maintainer checklist

Current state (2026-11-04): the repository lives at `github.com/Gjusev/folio`
(**private**), branch `master`, `package.json` at `0.1.0`, no tags yet. A
production instance runs on Dokploy (see [docs/deployment.md](docs/deployment.md)).
CI's `app` job uses `pgvector/pgvector:pg17` because migration `0006` creates
the `vector` extension; the `compiler` job builds the real container and runs
its end-to-end tests.

## 0. Before going public

- [ ] Local battery green: `pnpm services:up`, then
      `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- [ ] `pnpm e2e` green against a running stack.
- [ ] Version: `node -e "console.log(require('./package.json').version)"`.
- [ ] **Secrets in the history** (the repository is about to become public):
  - `.env` was never committed: `git log --all --full-history -- .env` is empty
    and `git ls-files | grep '^\.env'` lists only `.env.example`.
  - Sweep every revision for tokens:
    `git grep -iE "(api[_-]?key|token|password|secret)[\"']?[:=][\"']?[A-Za-z0-9/_+-]{16,}" $(git rev-list --all)`
    (or `gitleaks detect` / `trufflehog git file://.`).
    `ci.yml` defines `COMPILER_TOKEN: ci-compiler-token-…` on purpose: a public
    test value, not a secret.
  - If anything shows up, rotate it **before** publishing; rewriting public
    history is not an option afterwards.
- [ ] Review the `CHANGELOG.md` section of the release — it becomes the release
      text.

## 1. Publish the repository

- [ ] Optionally rename the default branch: `git branch -m master main` and
      `git push -u origin main` (CI triggers on both).
- [ ] Make the repository public (Settings → General → Danger zone).
- [ ] Upload `docs/brand/social-preview.png` in Settings → General → Social
      preview.
- [ ] Check that CI is green on the default branch (`app` and `compiler` jobs).
- [ ] Add the comparison link at the end of `CHANGELOG.md`:
      `[0.1.0]: https://github.com/Gjusev/folio/releases/tag/v0.1.0`.
- [ ] Signed tag: `git tag -s v0.1.0 -m "Folio 0.1.0" && git push origin v0.1.0`
      (needs `git config --global user.signingkey`).
- [ ] GitHub Release "v0.1.0" with the changelog section and the images in
      `docs/images/`.

## 2. Container image

- [ ] Multi-arch build and push of the web image:
      `docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/gjusev/folio:0.1.0 -t ghcr.io/gjusev/folio:latest --push .`
- [ ] Smoke test the published image from a clean directory with a minimal
      compose file: register, load the demo project, compile.

## 3. Announcement

- [ ] r/LaTeX (read the self-promotion rules first), Show HN ("Show HN: Folio –
      a self-hosted LaTeX editor…"), optionally r/selfhosted.
- [ ] The text says what it is, why it exists (Prism closes on 2027-01-01), the
      licence, how to try it in three commands, and the "not in this release"
      list below, verbatim. Honesty about limits is a project principle.

## Not in 0.1.0 (copy into the announcement)

- Real-time collaboration is **opt-in and experimental** (`COLLAB_URL` empty by
  default); in production the relay needs `wss://`.
- RAG needs an embedding provider; without one, indexing answers 503 with a
  clear message.
- One web instance only: rate limits live in memory; the compiler is one shared
  container with `MAX_CONCURRENT_JOBS`.
- No SSO/OIDC: local accounts only.
- The AI features are verified against fake OpenAI-compatible servers in tests;
  no paid model runs in CI.

## 4. After the release

- [ ] Open issues for the [roadmap](docs/roadmap.md) items.
- [ ] Record the release and announcement URLs here.
