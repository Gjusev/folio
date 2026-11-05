// The product tour's single source of truth: which tasks exist, in order, and
// the pure progress math over them. `tourEvent` is the tiny event bus the
// workspace dispatches at each success point; `useOnboardingTasks` listens.

import type { MsgKey } from "@/lib/i18n/dictionaries";

export const TASK_IDS = [
  "create-project",
  "compile",
  "pdf-click",
  "cite-paper",
  "library",
  "graph",
  "snapshot",
  "check",
  "review",
  "share-or-token",
] as const;

export type TaskId = (typeof TASK_IDS)[number];

export type TourTask = {
  id: TaskId;
  title: MsgKey;
  /** One line saying WHERE the thing lives (tab or menu name). */
  hint: MsgKey;
  /** Counted (and shown) only when an AI provider is configured. */
  needsAi?: boolean;
  /** Offers «Show me»: the workspace can navigate to this task's place. */
  guide?: boolean;
};

export const TOUR_TASKS: readonly TourTask[] = [
  {
    id: "create-project",
    title: "onb.task.create",
    hint: "onb.hint.create",
  },
  {
    id: "compile",
    title: "onb.task.compile",
    hint: "onb.hint.compile",
    guide: true,
  },
  {
    id: "pdf-click",
    title: "onb.task.pdf",
    hint: "onb.hint.pdf",
    guide: true,
  },
  {
    id: "cite-paper",
    title: "onb.task.cite",
    hint: "onb.hint.cite",
    guide: true,
  },
  {
    id: "library",
    title: "onb.task.library",
    hint: "onb.hint.library",
    guide: true,
  },
  {
    id: "graph",
    title: "onb.task.graph",
    hint: "onb.hint.graph",
    guide: true,
  },
  {
    id: "snapshot",
    title: "onb.task.snapshot",
    hint: "onb.hint.snapshot",
    guide: true,
  },
  {
    id: "check",
    title: "onb.task.check",
    hint: "onb.hint.check",
    guide: true,
  },
  {
    id: "review",
    title: "onb.task.review",
    hint: "onb.hint.review",
    needsAi: true,
    guide: true,
  },
  {
    id: "share-or-token",
    title: "onb.task.share",
    hint: "onb.hint.share",
    guide: true,
  },
];

/** The ring and the list only count tasks this user can actually do. */
export function availableTasks(aiEnabled: boolean): readonly TourTask[] {
  return TOUR_TASKS.filter((t) => !t.needsAi || aiEnabled);
}

export type Progress = {
  total: number;
  doneCount: number;
  /** The first task in order that is not done yet. */
  current: TaskId | null;
  isDone: (id: TaskId) => boolean;
};

/** Pure: stored done ids (which may contain unknown/stale ids) + the visible
 *  task list → progress. Unknown ids are ignored, order decides the current. */
export function tourProgress(done: readonly string[], tasks: readonly TourTask[]): Progress {
  const set = new Set(done);
  const doneCount = tasks.filter((t) => set.has(t.id)).length;
  const current = tasks.find((t) => !set.has(t.id))?.id ?? null;
  return { total: tasks.length, doneCount, current, isDone: (id) => set.has(id) };
}

/** The ids a set of mount-time server truths settles (never un-sets one). */
export function truthsToIds(truths: Partial<Record<TaskId, boolean>>): TaskId[] {
  return TASK_IDS.filter((id) => truths[id] === true);
}

/** Fires the workspace-wide "this just happened" signal for one task. */
export function tourEvent(taskId: TaskId): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("folio:onboarding", { detail: taskId }));
}
