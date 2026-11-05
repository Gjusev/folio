"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import { api } from "@/lib/client/api";
import { availableTasks, TASK_IDS, tourProgress, truthsToIds, type TaskId } from "./tasks";

type Options = {
  aiEnabled: boolean;
  /** Facts the workspace already knows from its server-rendered files. */
  truths?: Partial<Record<TaskId, boolean>>;
};

/** Stable fallback so a missing provider value cannot churn the memos. */
const NO_DONE: string[] = [];

/**
 * Tour detection: preferences hold what already counted, window events carry
 * what just happened, and one round of cheap server truths on mount lets a
 * returning user see real progress without doing anything.
 */
export function useOnboardingTasks(projectId: string, { aiEnabled, truths }: Options) {
  const prefs = usePreferences();
  const done = prefs.onboarding?.done ?? NO_DONE;
  const tasks = useMemo(() => availableTasks(aiEnabled), [aiEnabled]);
  const progress = useMemo(() => tourProgress(done, tasks), [done, tasks]);

  // Latest copies for the stable listeners below.
  const markRef = useRef(prefs.markOnboarding);
  const doneRef = useRef(done);
  const truthsRef = useRef(truths);
  useEffect(() => {
    markRef.current = prefs.markOnboarding;
    doneRef.current = done;
    truthsRef.current = truths;
  });

  function mark(id: TaskId) {
    if (doneRef.current.includes(id)) return; // no PUT per extra compile
    doneRef.current = [...doneRef.current, id];
    markRef.current(id);
  }

  // What just happened anywhere in the workspace (compile, cite, snapshot…).
  useEffect(() => {
    const onEvent = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if ((TASK_IDS as readonly string[]).includes(id)) mark(id as TaskId);
    };
    window.addEventListener("folio:onboarding", onEvent);
    return () => window.removeEventListener("folio:onboarding", onEvent);
  }, []);

  // Server truths, once per project mount. ponytail: mount-only is enough —
  // later realities arrive as events; re-poll on view switches if that shows gaps.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settled = new Set(truthsRef.current ? truthsToIds(truthsRef.current) : []);
      const [snapshots, tokens, members] = await Promise.all([
        api<{ snapshots: unknown[] }>("GET", `/api/projects/${projectId}/snapshots`).catch(
          () => null,
        ),
        api<{ tokens: unknown[] }>("GET", "/api/tokens").catch(() => null),
        api<{ members: unknown[] }>("GET", `/api/projects/${projectId}/members`).catch(() => null),
      ]);
      if (snapshots?.snapshots?.length) settled.add("snapshot");
      if (tokens?.tokens?.length || members?.members?.length) settled.add("share-or-token");
      if (!cancelled) for (const id of settled) mark(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return {
    ...progress,
    tasks,
    dismissed: Boolean(prefs.onboarding?.dismissedAt),
  };
}
