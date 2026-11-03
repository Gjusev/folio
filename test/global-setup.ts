import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Migrate the test database once and start from empty tables.
export default async function setup() {
  if (process.env.SKIP_DB_SETUP) return; // e.g. compiler-only e2e runs
  const url = process.env.TEST_DATABASE_URL ?? "postgres://folio:folio@localhost:5432/folio_test";
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await pool.query("TRUNCATE users, sessions, projects, files CASCADE");
  } catch (err) {
    throw new Error(
      `Test database unavailable at ${url}. Start it with "pnpm services:up" (or set TEST_DATABASE_URL).\n${String(err)}`,
    );
  } finally {
    await pool.end();
  }
}
