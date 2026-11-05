import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  DEFAULT_APPEARANCE,
  getPreferences,
  saveAppearance,
  saveOnboarding,
} from "@/lib/preferences";
import { db, closeDb, schema } from "@/lib/db";
import { signUp } from "../../test/helpers";

async function signUpUserId(): Promise<string> {
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

describe("preferences store", () => {
  it("returns defaults for a fresh user, never null", async () => {
    const userId = await signUpUserId();
    const prefs = await getPreferences(userId);
    expect(prefs.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(prefs.onboarding).toEqual({ done: [] });
  });

  it("round-trips appearance and onboarding through the database", async () => {
    const userId = await signUpUserId();
    await saveAppearance(userId, { theme: "dark", fontScale: "l" });
    await saveOnboarding(userId, { done: ["tour.editor"] });
    await saveOnboarding(userId, { dismissed: true });

    const prefs = await getPreferences(userId);
    expect(prefs.appearance).toEqual({ ...DEFAULT_APPEARANCE, theme: "dark", fontScale: "l" });
    expect(prefs.onboarding.done).toEqual(["tour.editor"]);
    expect(prefs.onboarding.dismissedAt).toBeTruthy();
  });

  it("drops unknown stored values instead of feeding them to the UI", async () => {
    const userId = await signUpUserId();
    // Simulate stale or hand-edited storage.
    await db()
      .insert(schema.userPreferences)
      .values({ userId, appearance: { theme: "sepia", uiFont: "comic-sans" } as object })
      .onConflictDoNothing();
    expect((await getPreferences(userId)).appearance).toEqual(DEFAULT_APPEARANCE);
  });
});
