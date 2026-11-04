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
