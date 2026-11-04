# Phase 0 — Operations Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the production instance safe to keep running: health endpoint and monitoring, off-host database backups with a rehearsed restore, no test accounts in production, a deliberate registration policy, and proof that the AI features work against a real model.

> **Progress (2026-11-04):** Tasks 1–4 DONE (commits 63d1004, d112ae3, e7be444; deployed, `/api/health` green in production). Task 9 Step 1–2 done (`scripts/ai-smoke.mts`, commit 3f1bc69); Steps 3–6 wait for an owner AI key. Task 7 code done (commit be0c897 + the /register gate in the Phase 1 workflow); Step 1 (owner account) and Step 8 (production `ALLOW_REGISTRATION` decision) wait for the owner. Tasks 5, 6 and 8 wait for owner inputs (S3 bucket, notification channel, purge confirmation).

**Architecture:** two small code additions (`/api/health` backed by a pure `checkHealth()` with injectable probes; a self-contained `scripts/purge-accounts.mts`), one HTTP smoke script for real-model AI, a landing tweak for closed registration, and operations done through the Dokploy MCP tools (backups, schedules, notifications, uptime monitor).

**Tech Stack:** Next.js 16 route handlers, Drizzle/`pg`, Vitest (real Postgres test DB), Playwright, Dokploy MCP.

**Context you need:**

- Repo: `C:\Code Main\Folio` (Windows, Git Bash). Never write files containing backslashes with bash heredocs — use the Write/Edit tools.
- Local stack: `pnpm services:up` (Postgres + compiler on 127.0.0.1:3001). Tests: `pnpm test` (uses the `folio_test` DB). Built app for e2e: `pnpm build` then `pnpm exec next start -H 127.0.0.1 -p 3210` with `.env` loaded and `DATABASE_URL=postgres://folio:$POSTGRES_PASSWORD@127.0.0.1:5432/folio`. Ports 3000/3100 are taken by other apps.
- Production: Dokploy compose `UACGsfIaf5WFrYVtxBP6x` (app name `folio-gqx9al`, services `db`, `compiler`, `collab`, `web`), <https://folio.mokka-dev.de>. Environment is saved with `mcp__dokploy__compose-saveEnvironment` — it **replaces the whole env**, so always send every variable (read the current list from the owner's notes/memory, never print secrets in chat).
- Commit messages end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

**Inputs from the owner (ask before the task that needs them):**

| Input                                                                   | Needed by |
| ----------------------------------------------------------------------- | --------- |
| S3-compatible bucket: endpoint, bucket, region, access key, secret      | Task 5    |
| Notification channel (e-mail SMTP, Telegram bot, Discord/Slack webhook) | Task 6    |
| Decision: keep public registration open or closed                       | Task 7    |
| One AI provider key, added by the owner in Folio → Settings             | Task 9    |

---

## File structure

| File                                                                                     | Responsibility                                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/lib/health.ts` (new)                                                                | `checkHealth()` with injectable probes and timeouts        |
| `src/lib/health.test.ts` (new)                                                           | Unit tests of the report logic                             |
| `src/app/api/health/route.ts` (new)                                                      | Public `GET /api/health`, 200/503, `no-store`              |
| `src/app/api/health.test.ts` (new)                                                       | Route test against the real test DB                        |
| `docker-compose.yml`, `docker-compose.dokploy.yml`                                       | Web container healthcheck                                  |
| `scripts/purge-accounts.mts` (new)                                                       | Deletes accounts of one e-mail domain (dry run by default) |
| `src/lib/purge-accounts.test.ts` (new)                                                   | Tests the purge against the test DB                        |
| `src/components/landing/Landing.tsx`, `src/app/page.tsx`, `src/lib/i18n/landing-dict.ts` | Closed-registration CTA                                    |
| `test/e2e/onboarding.spec.ts`                                                            | Skips sign-up flows when registration is closed            |
| `scripts/ai-smoke.mts` (new)                                                             | Real-model smoke battery over HTTP                         |
| `docs/deployment.md`, `CHANGELOG.md`                                                     | Operations docs                                            |

---

### Task 1: `checkHealth()` (pure, injectable)

**Files:**

- Create: `src/lib/health.ts`
- Test: `src/lib/health.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/health.test.ts
import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

const ok = async () => {};
const boom = async () => {
  throw new Error("down");
};
const hang = () => new Promise<void>(() => {});

describe("checkHealth", () => {
  it("is ok when every probe passes", async () => {
    expect(await checkHealth({ db: ok, compiler: ok })).toEqual({
      ok: true,
      db: "ok",
      compiler: "ok",
    });
  });

  it("reports the failing dependency and is not ok", async () => {
    expect(await checkHealth({ db: boom, compiler: ok })).toEqual({
      ok: false,
      db: "down",
      compiler: "ok",
    });
  });

  it("treats a probe that hangs as down after the timeout", async () => {
    const started = Date.now();
    const r = await checkHealth({ db: ok, compiler: hang }, 50);
    expect(r).toEqual({ ok: false, db: "ok", compiler: "down" });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/lib/health.test.ts`
Expected: FAIL — `Failed to resolve import "./health"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/health.ts
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export type Probe = () => Promise<void>;
export type HealthReport = { ok: boolean; db: "ok" | "down"; compiler: "ok" | "down" };

const DEFAULT_PROBES: { db: Probe; compiler: Probe } = {
  db: async () => {
    await db().execute(sql`select 1`);
  },
  compiler: async () => {
    const res = await fetch(`${env().COMPILER_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`compiler ${res.status}`);
  },
};

async function passes(probe: Probe, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    await Promise.race([probe(), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Liveness of the app's dependencies. Says nothing about users or data. */
export async function checkHealth(
  probes: { db: Probe; compiler: Probe } = DEFAULT_PROBES,
  timeoutMs = 3000,
): Promise<HealthReport> {
  const [dbOk, compilerOk] = await Promise.all([
    passes(probes.db, timeoutMs),
    passes(probes.compiler, timeoutMs),
  ]);
  return {
    ok: dbOk && compilerOk,
    db: dbOk ? "ok" : "down",
    compiler: compilerOk ? "ok" : "down",
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/health.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/health.ts src/lib/health.test.ts
git commit -m "feat(ops): checkHealth con sondas inyectables y timeout

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: `GET /api/health` and the container healthcheck

**Files:**

- Create: `src/app/api/health/route.ts`
- Test: `src/app/api/health.test.ts`
- Modify: `docker-compose.yml` (service `web`), `docker-compose.dokploy.yml` (service `web`)

- [ ] **Step 1: Write the failing route test**

```ts
// src/app/api/health.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { closeDb } from "@/lib/db";
import { request } from "../../../test/helpers";

afterAll(closeDb);

describe("GET /api/health", () => {
  it("answers without a session, never cached, status matching the report", async () => {
    const res = await GET(request("GET", "/api/health"), undefined);
    const body = await res.json();
    expect(body.db).toBe("ok"); // the test database is up
    expect(["ok", "down"]).toContain(body.compiler);
    expect(res.status).toBe(body.ok ? 200 : 503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual(["compiler", "db", "ok"]); // nothing else leaks
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/api/health.test.ts`
Expected: FAIL — cannot resolve `@/app/api/health/route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { checkHealth } from "@/lib/health";

// Public on purpose (uptime monitors, container healthchecks): it reveals only
// whether the database and the compiler answer.
export const GET = route(async () => {
  const report = await checkHealth();
  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/app/api/health.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Add the healthcheck to the `web` service in both compose files**

In `docker-compose.yml` and in `docker-compose.dokploy.yml`, under `web:`, after `restart: unless-stopped`, add:

```yaml
healthcheck:
  test:
    - CMD
    - node
    - -e
    - "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 40s
```

Run: `docker compose -f docker-compose.dokploy.yml config >/dev/null && echo valid`
Expected: `valid` (Compose needs the env vars; run with `POSTGRES_PASSWORD=x COMPILER_TOKEN=xxxxxxxxxxxxxxxx` prefixed).

- [ ] **Step 6: Verify against the built app**

Run: `pnpm build`, restart the local server on :3210, then `curl -s -i http://127.0.0.1:3210/api/health`
Expected: `HTTP/1.1 200` and `{"ok":true,"db":"ok","compiler":"ok"}` with the local stack up.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/health src/app/api/health.test.ts docker-compose.yml docker-compose.dokploy.yml
git commit -m "feat(ops): GET /api/health y healthcheck del contenedor web

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Account purge script

**Files:**

- Create: `scripts/purge-accounts.mts`
- Test: `src/lib/purge-accounts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/purge-accounts.test.ts
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { purgeAccounts } from "../../scripts/purge-accounts.mts";

const pool = new Pool({ connectionString: env().DATABASE_URL });
afterAll(() => pool.end());

async function seed(domain: string, n: number) {
  for (let i = 0; i < n; i++) {
    await pool.query("insert into users (email, name, password_hash) values ($1, 'x', 'x')", [
      `u${i}-${randomUUID()}@${domain}`,
    ]);
  }
}

describe("purgeAccounts", () => {
  it("dry run lists the domain's accounts and deletes nothing", async () => {
    const domain = `purge-${randomUUID().slice(0, 8)}.dev`;
    await seed(domain, 2);
    const r = await purgeAccounts(pool, domain, false);
    expect(r.emails).toHaveLength(2);
    expect(r.deleted).toBe(0);
    expect((await purgeAccounts(pool, domain, false)).emails).toHaveLength(2);
  });

  it("apply deletes exactly that domain and nothing that merely contains it", async () => {
    const domain = `purge-${randomUUID().slice(0, 8)}.dev`;
    await seed(domain, 2);
    await seed(`sub.${domain}`, 1); // a different domain that ends with it
    const r = await purgeAccounts(pool, domain, true);
    expect(r.deleted).toBe(2);
    expect((await purgeAccounts(pool, domain, false)).emails).toHaveLength(0);
    expect((await purgeAccounts(pool, `sub.${domain}`, false)).emails).toHaveLength(1);
  });

  it("refuses anything that is not a full domain", async () => {
    for (const bad of ["", "dev", "%", "a@b.dev", "*.dev", "x_y.dev"]) {
      await expect(purgeAccounts(pool, bad, true)).rejects.toThrow(/Refusing/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/lib/purge-accounts.test.ts`
Expected: FAIL — cannot resolve `../../scripts/purge-accounts.mts`.

- [ ] **Step 3: Write the script**

```ts
// scripts/purge-accounts.mts
// Deletes every account whose e-mail is exactly @<domain> (projects, files,
// sessions and memberships cascade). Dry run unless --yes:
//
//   node --env-file-if-exists=.env scripts/purge-accounts.mts --domain t.dev
//   node --env-file-if-exists=.env scripts/purge-accounts.mts --domain t.dev --yes
//
// Self-contained (only `pg`) like reset-password.mts, so it runs in the web
// container even when the app tree is broken.
import { resolve } from "node:path";
import { Pool } from "pg";

const DOMAIN = /^(?=.{4,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export async function purgeAccounts(
  pool: Pool,
  domain: string,
  apply: boolean,
): Promise<{ emails: string[]; deleted: number }> {
  const d = domain.trim().toLowerCase();
  if (!DOMAIN.test(d)) throw new Error(`Refusing: "${domain}" is not a full e-mail domain`);
  const match = "right(lower(email), length($1) + 1) = '@' || $1";
  const { rows } = await pool.query<{ email: string }>(
    `select email from users where ${match} order by email`,
    [d],
  );
  if (!apply) return { emails: rows.map((r) => r.email), deleted: 0 };
  const del = await pool.query(`delete from users where ${match}`, [d]);
  return { emails: rows.map((r) => r.email), deleted: del.rowCount ?? 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const domain = args[args.indexOf("--domain") + 1] ?? "";
  const apply = args.includes("--yes");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await purgeAccounts(pool, domain, apply);
    for (const e of r.emails) console.log(e);
    console.log(
      apply
        ? `Deleted ${r.deleted} account(s) @${domain}.`
        : `${r.emails.length} account(s) @${domain}. Dry run: add --yes to delete.`,
    );
  } finally {
    await pool.end();
  }
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/purge-accounts.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Add the npm script**

In `package.json` → `scripts`, add after `"reset-password"`:

```json
"purge-accounts": "node --env-file-if-exists=.env scripts/purge-accounts.mts",
```

Run: `pnpm purge-accounts --domain example.invalid`
Expected: `0 account(s) @example.invalid. Dry run: add --yes to delete.`

- [ ] **Step 6: Commit**

```bash
git add scripts/purge-accounts.mts src/lib/purge-accounts.test.ts package.json
git commit -m "feat(ops): pnpm purge-accounts --domain (dry run por defecto)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Ship Tasks 1–3 to production

- [ ] **Step 1:** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` — all green.
- [ ] **Step 2:** `git push origin master`, then `mcp__dokploy__compose-deploy` with `composeId: UACGsfIaf5WFrYVtxBP6x`.
- [ ] **Step 3:** Poll until live: `curl -s https://folio.mokka-dev.de/api/health` returns `{"ok":true,"db":"ok","compiler":"ok"}`.
- [ ] **Step 4:** `mcp__dokploy__docker-getContainersByAppNameMatch` with `appName: folio-gqx9al` — `folio-gqx9al-web-1` shows `(healthy)`.

---

### Task 5: Off-host backups and a restore drill (needs the S3 input)

The database runs inside the compose stack (service `db`, user `folio`, database `folio`), not as a Dokploy-managed Postgres.

- [ ] **Step 1:** Ask the owner for the S3-compatible bucket details. Do not continue without them; do not store them anywhere but Dokploy.
- [ ] **Step 2:** Load the tools: `ToolSearch` with `select:mcp__dokploy__destination-create,mcp__dokploy__destination-testConnection,mcp__dokploy__backup-create,mcp__dokploy__backup-manualBackupCompose,mcp__dokploy__backup-listBackupFiles`. Read each schema before calling.
- [ ] **Step 3:** `destination-create` with the bucket; `destination-testConnection` must succeed.
- [ ] **Step 4:** `backup-create` for the compose (`composeId: UACGsfIaf5WFrYVtxBP6x`, service `db`, database type postgres, database `folio`, user `folio`), schedule `0 3 * * *` (daily 03:00), keep the latest 14, prefix `folio/`.
- [ ] **Step 5:** `backup-manualBackupCompose` once; `backup-listBackupFiles` shows a new dump with a non-trivial size.
- [ ] **Step 6: Restore drill (local, never on production).** Download that dump from the bucket (S3 console or `aws s3 cp` / `rclone`), then:

```bash
docker run -d --name folio-restore -e POSTGRES_PASSWORD=drill -p 127.0.0.1:55432:5432 pgvector/pgvector:pg17
sleep 5
# plain SQL dumps:
gunzip -c folio-dump.sql.gz | docker exec -i folio-restore psql -U postgres
# or custom-format dumps: docker exec -i folio-restore pg_restore -U postgres -d postgres --no-owner < folio.dump
docker exec folio-restore psql -U postgres -d folio -c "select count(*) from users; select count(*) from projects; select count(*) from files;"
docker rm -f folio-restore
```

Expected: the counts match production's order of magnitude (compare with the purge dry run of Task 8). Record the date and counts in `docs/deployment.md` → Operations → Backups.

- [ ] **Step 7: Commit the docs**

Add to `docs/deployment.md` under **Backups**:

```markdown
- **Production:** Dokploy backs up the `db` service daily at 03:00 to the
  S3-compatible destination `folio-backups` (14 kept). Restore drill: download a
  dump, load it into a throwaway `pgvector/pgvector:pg17` container, compare
  `users`/`projects`/`files` counts. Last drill: YYYY-MM-DD (users N, projects N, files N).
```

```bash
git add docs/deployment.md
git commit -m "docs(ops): copias diarias a S3 y simulacro de restauración

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Alerts — deploy failures and uptime (needs the channel input)

- [ ] **Step 1:** Ask the owner for the channel. Load the matching tools, e.g. `select:mcp__dokploy__notification-createTelegram,mcp__dokploy__notification-testTelegramConnection` (or Email/Discord/Slack/Ntfy).
- [ ] **Step 2:** Create the notification with deploy-failure, backup-failure and server-threshold events on; send the test message; the owner confirms receipt.
- [ ] **Step 3: Uptime monitor.** `mcp__dokploy__compose-templates` → find `uptime-kuma`; `compose-deployTemplate` into project Folio (environment `lrz_QdNih-nfacZf8kSF9`); add a domain such as `status-folio.mokka-dev.de` (HTTPS). In Uptime Kuma: HTTP monitor `https://folio.mokka-dev.de/api/health`, every 60 s, expected status 200, notifications to the same channel.
- [ ] **Step 4: Prove it.** Temporarily stop the compiler (`mcp__dokploy__docker-stopContainer` on `folio-gqx9al-compiler-1`), wait for the alert (≤ 3 min), start it again, wait for the recovery message.
- [ ] **Step 5:** Note in `docs/deployment.md` that Uptime Kuma runs on the same host (it will not report a full host outage) and commit.

---

### Task 7: Registration policy and the closed-registration landing

Default recommendation: **closed** until Phase 5 (per-job isolation), because every account can run LaTeX in the shared compiler container. Ask the owner; if they choose open, skip Steps 2–7 and do only Step 8 with `ALLOW_REGISTRATION=1`.

**Files:**

- Modify: `src/app/page.tsx`, `src/components/landing/Landing.tsx`, `src/lib/i18n/landing-dict.ts`, `test/e2e/onboarding.spec.ts`

- [ ] **Step 1:** The owner registers their own account on production first.
- [ ] **Step 2: Landing CTA when registration is closed.** In `src/app/page.tsx` pass the flag:

```tsx
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { currentUser } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { getDict } from "@/lib/i18n/server";
import { daysUntilPrismCloses } from "@/lib/prism";

export default async function Home() {
  if (await currentUser()) redirect("/projects");
  const { dict } = await getDict();
  return (
    <Landing
      dict={dict}
      daysLeft={daysUntilPrismCloses()}
      registrationOpen={env().ALLOW_REGISTRATION}
    />
  );
}
```

- [ ] **Step 3:** In `src/components/landing/Landing.tsx`, add the prop `registrationOpen: boolean` to the `Landing` signature, and replace each of the three `href="/register"` CTAs (hero button, Prism step 2, close button) with:

```tsx
href={registrationOpen ? "/register" : SELF_HOST_URL}
```

where, next to `REPO_URL`:

```tsx
// Without open registration the honest action is "run your own".
const SELF_HOST_URL = REPO_URL ? `${REPO_URL}#quick-start-docker` : "/login";
```

and the hero/close button labels become `t(registrationOpen ? "landing.cta.main" : "landing.cta.selfhost")` and `t(registrationOpen ? "landing.close.cta" : "landing.cta.selfhost")`.

- [ ] **Step 4:** Add the key to the three dictionaries in `src/lib/i18n/landing-dict.ts` (after `"landing.cta.more"` in each):

```ts
  "landing.cta.selfhost": "Instálalo en tu servidor",   // es
  "landing.cta.selfhost": "Run it on your server",      // en
  "landing.cta.selfhost": "Auf deinem Server betreiben", // de
```

- [ ] **Step 5:** `test/e2e/onboarding.spec.ts`: at the top of both sign-up tests add

```ts
const probe = await page.request.post("/api/auth/register", { data: {} });
test.skip(probe.status() === 403, "registration is closed on this instance");
```

(an open instance answers 400 to the empty body; a closed one 403 before validation).

- [ ] **Step 6:** `pnpm typecheck && pnpm lint && pnpm test`, then the local e2e with `ALLOW_REGISTRATION=0` set for the :3210 server: the onboarding sign-up tests are skipped, the rest pass; the landing buttons point to the self-host anchor.
- [ ] **Step 7:** Commit:

```bash
git add src/app/page.tsx src/components/landing/Landing.tsx src/lib/i18n/landing-dict.ts test/e2e/onboarding.spec.ts
git commit -m "feat(landing): CTA de autoalojamiento cuando el registro está cerrado

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [ ] **Step 8:** Save the production env with the chosen `ALLOW_REGISTRATION` (all other variables unchanged; `NEXT_PUBLIC_REPO_URL` only once the repo is public — Phase 1), push, deploy, run the production e2e with `E2E_USER`/`E2E_PASS` set to a dedicated account the owner created (`seed()` falls back to it when registration answers 403).

---

### Task 8: Remove the e2e accounts from production

- [ ] **Step 1:** Load `select:mcp__dokploy__schedule-create,mcp__dokploy__schedule-runManually,mcp__dokploy__schedule-delete` and read their schemas.
- [ ] **Step 2:** Create a one-off schedule on the compose service `web` with the command `node scripts/purge-accounts.mts --domain t.dev` (dry run). Run it manually and read its log: the list must contain only `@t.dev` addresses (e2e accounts: `e2e-…`, `demo-…`, `welcome-…`, `flow-…`, `shots-…`, `logo-…`, plus `e2e-persistent@t.dev`).
- [ ] **Step 3:** Owner confirms. Change the command to `… --yes`, run it, check the log says `Deleted N account(s) @t.dev.`, run the dry run again: `0 account(s)`.
- [ ] **Step 4:** Delete the schedule. If production e2e will keep running against this instance, the owner creates a dedicated account and Task 7 Step 8 applies.

---

### Task 9: Real-model AI smoke battery (needs the owner's key)

**Files:**

- Create: `scripts/ai-smoke.mts`

- [ ] **Step 1: Write the script**

```ts
// scripts/ai-smoke.mts
// Exercises the AI features against the provider configured for a real
// account, over HTTP, exactly as the browser does:
//   AI_SMOKE_URL=https://folio.mokka-dev.de AI_SMOKE_EMAIL=… AI_SMOKE_PASSWORD=… node scripts/ai-smoke.mts
// Creates one demo project, reviews it, asks the assistant, deletes the project.
const BASE = process.env.AI_SMOKE_URL ?? "http://127.0.0.1:3210";
const EMAIL = process.env.AI_SMOKE_EMAIL ?? "";
const PASSWORD = process.env.AI_SMOKE_PASSWORD ?? "";
if (!EMAIL || !PASSWORD) throw new Error("Set AI_SMOKE_EMAIL and AI_SMOKE_PASSWORD");

let cookie = "";
async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return res;
}

const results: { check: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ check: name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const login = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
check("login", login.ok, String(login.status));
if (!login.ok) process.exit(1);

const demo = await (await call("POST", "/api/projects/demo", { lang: "en" })).json();
const id: string = demo.project.id;
const detail = await (await call("GET", `/api/projects/${id}`)).json();
const main = (detail.files as { id: string; path: string; content: string }[]).find(
  (f) => f.path === "main.tex",
)!;
const lines = main.content.split("\n");

try {
  // 1. Review mode: valid structure, verified locations, every requested aspect respected.
  const t0 = Date.now();
  const rv = await call("POST", `/api/projects/${id}/review`, {
    lang: "en",
    aspects: [
      "clarity",
      "structure",
      "argument",
      "evidence",
      "citations",
      "language",
      "math",
      "format",
    ],
    rigor: "strict",
    focus: "",
    scope: "all",
  });
  const rvBody = await rv.json();
  check("review: 200", rv.ok, `${rv.status} in ${Date.now() - t0} ms`);
  if (rv.ok) {
    const comments = rvBody.review.comments as {
      file: string | null;
      line: number | null;
      quote: string | null;
    }[];
    const located = comments.filter((c) => c.file && c.line);
    check("review: has comments", comments.length > 0, `${comments.length} comments`);
    check("review: some are located", located.length > 0, `${located.length} located`);
    check(
      "review: quotes really occur on their lines",
      located.every((c) => !c.quote || lines[c.line! - 1].replace(/\s+/g, " ").includes(c.quote)),
    );
    check(
      "review: summary present",
      typeof rvBody.review.summary === "string" && rvBody.review.summary.length > 20,
    );
  }

  // 2. Assistant: streams a non-empty answer about the document.
  const ai = await call("POST", `/api/projects/${id}/ai`, {
    action: "ask",
    fileId: main.id,
    instruction: "In one sentence, what is this paper about?",
  });
  const answer = ai.ok ? await ai.text() : "";
  check(
    "assistant: streamed answer",
    ai.ok && answer.trim().length > 20,
    `${ai.status}, ${answer.length} chars`,
  );
} finally {
  await call("DELETE", `/api/projects/${id}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2:** `pnpm exec prettier --write scripts/ai-smoke.mts && pnpm lint && pnpm typecheck`.
- [ ] **Step 3:** The owner adds a provider in Settings (production account). Run against production: `AI_SMOKE_URL=https://folio.mokka-dev.de AI_SMOKE_EMAIL=… AI_SMOKE_PASSWORD=… node scripts/ai-smoke.mts`.
- [ ] **Step 4:** In the browser, also run once by hand: the drafting agent on the demo ("Write a related-work paragraph on efficient attention") — it must stream, show evidence, strip invented keys, and the critique/verification steps must finish.
- [ ] **Step 5:** For every FAIL: reproduce with a unit test in `src/lib/review.test.ts` / `src/lib/ai-prompts.test.ts` built from the real model's raw answer (log it temporarily, never commit keys), fix the parser or prompt, re-run the smoke until all checks pass.
- [ ] **Step 6:** Update `docs/ai.md` → **What is tested** with the provider, model and date of the real-model run, and the remaining known gaps. Commit:

```bash
git add scripts/ai-smoke.mts docs/ai.md src/lib
git commit -m "test(ai): batería de humo contra un modelo real y ajustes resultantes

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: Close the phase

- [ ] **Step 1:** `CHANGELOG.md` → Unreleased: Added `/api/health`, container healthcheck, `pnpm purge-accounts`, `scripts/ai-smoke.mts`; Changed: registration policy; Operations: backups, alerts.
- [ ] **Step 2:** Full battery: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`; production e2e green.
- [ ] **Step 3:** Commit, push, deploy, verify `/api/health`, and report to the owner: backup destination and last drill, alert channel tested, accounts purged (count), registration state, AI smoke results with provider/model.

---

## Self-review

- Spec coverage: health ✔ (T1–2, T4), backups + restore ✔ (T5), alerts + uptime ✔ (T6), registration policy ✔ (T7), test accounts ✔ (T3, T8), real-model AI ✔ (T9), docs/changelog ✔ (T5–T10).
- Names are consistent: `checkHealth`/`HealthReport`/`Probe` (T1–2), `purgeAccounts(pool, domain, apply)` (T3, T8), `registrationOpen`/`SELF_HOST_URL`/`landing.cta.selfhost` (T7).
- Owner inputs are gated at the start of T5, T6, T7 and T9.
