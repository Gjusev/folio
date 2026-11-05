# End-to-end tests

Runner: `pnpm e2e` (`@playwright/test`). The specs drive a real browser against
a running stack. Locally, start the development override (compiler published on
127.0.0.1:3001) and the web app on 127.0.0.1:3000:

    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    RATE_LIMIT_MULTIPLIER=100 pnpm exec next start -H 127.0.0.1 -p 4210 &   # test server
    E2E_BASE_URL=http://127.0.0.1:4210 pnpm e2e

Against another deployment:

    E2E_BASE_URL=https://folio.example.org COLLAB_URL=wss://collab.example.org pnpm e2e

The suite needs more log-ins per 15 minutes than the production defaults allow, so run the test server with RATE_LIMIT_MULTIPLIER raised (the app default stays 1). Persistent accounts (E2E_USER, E2E_USER2 for the two-user specs) are logged in first; only the onboarding specs spend registration quota.

Test accounts are created on the fly through the registration API (falling back
to a persistent account when the registration rate limit kicks in). Each spec
works on its own projects seeded through the API and uses the UI only for the
flow it tests: search → cite, the graph explorer, compile/PDF, lint, SyncTeX,
collaboration (skipped when `COLLAB_URL` is unset), onboarding and the demo
project, browser-language detection, and the review panel.

Running the suite against a production instance leaves test accounts in its
database.
