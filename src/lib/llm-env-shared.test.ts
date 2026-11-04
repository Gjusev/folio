import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, schema } from "@/lib/db";
import { listProfiles, resolveEndpoint } from "@/lib/llm-profiles";
import { envEndpoint, llmConfigured } from "@/lib/llm";
import { signUp } from "../../test/helpers";

// LLM_ENV_SHARED=false with a fully configured .env endpoint: the shared key
// must disappear for EVERY user (BYOK enforcement) — from the profile list,
// from endpoint resolution and from the availability flag.
vi.hoisted(() => {
  process.env.LLM_CREDENTIALS_KEY = "t".repeat(64);
  process.env.LLM_BASE_URL = "https://api.mistral.ai/v1";
  process.env.LLM_MODEL = "mistral-small-latest";
  process.env.LLM_API_KEY = "sk-shared-admin-key";
  process.env.LLM_ENV_SHARED = "false";
});

async function freshUserId(): Promise<string> {
  const { email } = await signUp();
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return row.id;
}

afterAll(async () => {
  await closeDb();
});

describe("BYOK: LLM_ENV_SHARED=false hides the shared .env key", () => {
  it("resolveEndpoint returns null even with no personal profiles", async () => {
    expect(await resolveEndpoint(await freshUserId(), "draft")).toBeNull();
  });

  it("listProfiles omits the env profile; llmConfigured reports off", async () => {
    expect(await listProfiles(await freshUserId())).toEqual([]);
    expect(llmConfigured()).toBe(false);
    expect(envEndpoint()).toBeNull();
  });
});
