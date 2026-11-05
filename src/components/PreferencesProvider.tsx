"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, ApiError } from "@/lib/client/api";

export type Appearance = {
  theme: "system" | "light" | "dark";
  uiFont: "plex" | "switzer" | "system";
  fontScale: "s" | "m" | "l";
  editorFont: "plex-mono" | "system-mono";
};
export type Onboarding = { done: string[]; dismissedAt?: string };

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  uiFont: "plex",
  fontScale: "m",
  editorFont: "plex-mono",
};
const DEFAULT_ONBOARDING: Onboarding = { done: [] };

/** Must match the key read by the inline script in the root layout. */
export const APPEARANCE_STORAGE_KEY = "folio-appearance";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function resolvedTheme(theme: Appearance["theme"]): "light" | "dark" {
  return theme === "system" ? (darkQuery().matches ? "dark" : "light") : theme;
}

/** Paints the preferences onto <html>; safe to call on every change. */
function applyToDom(a: Appearance) {
  const d = document.documentElement;
  d.dataset.theme = resolvedTheme(a.theme);
  d.dataset.uiFont = a.uiFont;
  d.dataset.fontScale = a.fontScale;
  d.dataset.editorFont = a.editorFont;
}

function readStoredAppearance(): Appearance {
  try {
    return {
      ...DEFAULT_APPEARANCE,
      ...JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}"),
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

type PreferencesState = {
  appearance: Appearance;
  onboarding: Onboarding;
  setAppearance: (patch: Partial<Appearance>) => void;
  markOnboarding: (id: string) => void;
  dismissOnboarding: () => void;
};

const PreferencesContext = createContext<PreferencesState | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = useState(DEFAULT_APPEARANCE);
  const [onboarding, setOnboarding] = useState(DEFAULT_ONBOARDING);
  // Optimistic writes from guests (401) must not be clobbered by the fallback.
  // A 401 on the load only means "not logged in YET" (the provider mounts on
  // public pages too, and a form login keeps this instance): guests are
  // detected by a failing write, so a login mid-session still persists.
  const guest = useRef(false);
  // Writes before the first server load would persist a truncated state
  // (they are computed against an empty onboarding); they wait for the merge.
  const hydrated = useRef(false);

  /** Persists the given onboarding shape; guests stop trying after one 401. */
  function put(onboarding: { done?: string[]; dismissed?: boolean }) {
    void api("PUT", "/api/preferences", { onboarding }).catch((err) => {
      if (err instanceof ApiError && err.status === 401) guest.current = true;
    });
  }

  /** Loads the server state and merges it with any optimistic local marks. */
  const load = useCallback(() => {
    // Server state wins for sessions; guests fall back to localStorage.
    api<{ appearance: Appearance; onboarding: Onboarding }>("GET", "/api/preferences")
      .then((data) => {
        hydrated.current = true;
        setAppearanceState({ ...DEFAULT_APPEARANCE, ...data.appearance });
        const server = Array.isArray(data.onboarding.done) ? data.onboarding.done : [];
        setOnboarding((current) => {
          // Union: optimistic pre-load marks survive; the server keeps the rest.
          const done = [...new Set([...server, ...current.done])];
          const dismissedAt = current.dismissedAt ?? data.onboarding.dismissedAt;
          if (
            !guest.current &&
            (done.length !== server.length || (dismissedAt && !data.onboarding.dismissedAt))
          )
            put(dismissedAt && !data.onboarding.dismissedAt ? { done, dismissed: true } : { done });
          return { done, dismissedAt };
        });
        localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(data.appearance));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAppearanceState(readStoredAppearance());
        }
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    applyToDom(appearance);
  }, [appearance]);

  // While following the OS, keep the painted theme in sync with its changes.
  useEffect(() => {
    if (appearance.theme !== "system") return;
    const mq = darkQuery();
    const onChange = () => (document.documentElement.dataset.theme = resolvedTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appearance.theme]);

  const setAppearance = useCallback((patch: Partial<Appearance>) => {
    setAppearanceState((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    if (!guest.current) void api("PUT", "/api/preferences", { appearance: patch }).catch(() => {});
  }, []);

  const markOnboarding = useCallback(
    (id: string) => {
      // A login since mount (register/login form → client-side navigation)
      // never re-ran the load: fetch now; the merge persists this mark too.
      if (!hydrated.current) void load();
      setOnboarding((current) => {
        if (current.done.includes(id) || current.dismissedAt) return current;
        const done = [...current.done, id];
        if (!guest.current && hydrated.current) put({ done });
        return { ...current, done };
      });
    },
    [load],
  );

  const dismissOnboarding = useCallback(() => {
    if (!hydrated.current) void load();
    setOnboarding((current) => {
      const next = { ...current, dismissedAt: new Date().toISOString() };
      if (!guest.current && hydrated.current) put({ dismissed: true });
      return next;
    });
  }, [load]);

  const value = useMemo(
    () => ({ appearance, onboarding, setAppearance, markOnboarding, dismissOnboarding }),
    [appearance, onboarding, setAppearance, markOnboarding, dismissOnboarding],
  );
  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

/** Appearance and onboarding state anywhere in the client tree. */
export function usePreferences(): PreferencesState {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences without PreferencesProvider");
  return ctx;
}
