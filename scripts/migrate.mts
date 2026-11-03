// Applies SQL migrations from ./drizzle. Run: pnpm db:migrate
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log("migrations applied");
