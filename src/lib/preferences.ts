import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Theme: the shipped palettes, plus "system" following the OS. */
export type Theme = "system" | "light" | "dark";
/** UI font families available for the app chrome (not the code editor). */
export type UiFont = "plex" | "switzer" | "system";
/** Global text scale; the app is rem-based so one html rule scales it all. */
export type FontScale = "s" | "m" | "l";
/** Editor font families for the LaTeX source. */
export type EditorFont = "plex-mono" | "system-mono";

export type Appearance = {
  theme: Theme;
  uiFont: UiFont;
  fontScale: FontScale;
  editorFont: EditorFont;
};

/** Applied when the user never chose (all fields optional in storage). */
export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  uiFont: "plex",
  fontScale: "m",
  editorFont: "plex-mono",
};

/** Onboarding tours the user has completed; dismissedAt hides them for good. */
export type Onboarding = { done: string[]; dismissedAt?: string };

/** Keeps only known values, so stale or hand-edited storage can't break the UI. */
function sanitize(stored: unknown): Appearance {
  const s = (stored ?? {}) as Partial<Appearance>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  return {
    theme: pick(s.theme, ["system", "light", "dark"], DEFAULT_APPEARANCE.theme),
    uiFont: pick(s.uiFont, ["plex", "switzer", "system"], DEFAULT_APPEARANCE.uiFont),
    fontScale: pick(s.fontScale, ["s", "m", "l"], DEFAULT_APPEARANCE.fontScale),
    editorFont: pick(s.editorFont, ["plex-mono", "system-mono"], DEFAULT_APPEARANCE.editorFont),
  };
}

/** The user's preferences with defaults merged in; never null, never partial. */
export async function getPreferences(
  userId: string,
): Promise<{ appearance: Appearance; onboarding: Onboarding }> {
  const [row] = await db()
    .select()
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1);
  const onboarding = (row?.onboarding ?? {}) as Partial<Onboarding>;
  return {
    appearance: sanitize(row?.appearance),
    onboarding: {
      done: Array.isArray(onboarding.done) ? onboarding.done : [],
      ...(onboarding.dismissedAt ? { dismissedAt: onboarding.dismissedAt } : {}),
    },
  };
}

/** Deep-merge a partial appearance onto the stored one (upsert; row may not exist). */
export async function saveAppearance(userId: string, patch: Partial<Appearance>) {
  const current = await getPreferences(userId);
  await upsert(userId, { appearance: { ...current.appearance, ...patch } });
}

/** Record onboarding progress: append "done" ids, or set/clear the dismissal. */
export async function saveOnboarding(
  userId: string,
  patch: { done?: string[]; dismissed?: boolean },
) {
  const current = await getPreferences(userId);
  const onboarding: Onboarding = {
    done: patch.done ?? current.onboarding.done,
    ...(patch.dismissed === undefined && current.onboarding.dismissedAt
      ? { dismissedAt: current.onboarding.dismissedAt }
      : {}),
    ...(patch.dismissed === true ? { dismissedAt: new Date().toISOString() } : {}),
  };
  await upsert(userId, { onboarding });
}

async function upsert(
  userId: string,
  columns: { appearance?: Appearance; onboarding?: Onboarding },
) {
  const values = { userId, ...columns, updatedAt: new Date() };
  await db()
    .insert(schema.userPreferences)
    .values(values)
    .onConflictDoUpdate({ target: schema.userPreferences.userId, set: values });
}
