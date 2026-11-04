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
