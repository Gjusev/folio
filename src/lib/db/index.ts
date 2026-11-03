import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

// Survive dev hot reloads without leaking pools.
const g = globalThis as unknown as { folioDb?: { pool: Pool; db: Db } };

export function db(): Db {
  if (!g.folioDb) {
    const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
    g.folioDb = { pool, db: drizzle(pool, { schema }) };
  }
  return g.folioDb.db;
}

export async function closeDb() {
  await g.folioDb?.pool.end();
  g.folioDb = undefined;
}

export { schema };
