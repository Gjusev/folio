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
