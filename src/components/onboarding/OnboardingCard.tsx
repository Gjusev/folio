"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";
import { Mark } from "@/components/Logo";
import { useI18n } from "@/lib/i18n/client";
import type { TaskId } from "./tasks";
import { useOnboardingTasks } from "./useOnboardingTasks";

type Props = {
  projectId: string;
  aiEnabled: boolean;
  /** Facts the workspace already knows from its files. */
  truths?: Partial<Record<TaskId, boolean>>;
  /** Navigates to the task's place using the workspace's own handlers. */
  showMe: (id: TaskId) => void;
};

/** The tour, quietly: one collapsible row with a progress ring at the top of
 *  the Files sidebar, struck-through dones, one highlighted current task. */
export function OnboardingCard({ projectId, aiEnabled, truths, showMe }: Props) {
  const { t } = useI18n();
  const { dismissOnboarding } = usePreferences();
  const { tasks, doneCount, total, current, isDone, dismissed } = useOnboardingTasks(projectId, {
    aiEnabled,
    truths,
  });
  const [open, setOpen] = useState(false);

  if (dismissed) return null;

  const complete = total > 0 && doneCount === total;
  const ring = <Ring done={doneCount} total={total} />;
  const close = (
    <button
      type="button"
      className="btn btn-ghost btn-sm shrink-0"
      onClick={dismissOnboarding}
      aria-label={t("onb.dismiss")}
      title={t("onb.dismiss")}
      data-testid="onboarding-dismiss"
    >
      <X size={12} aria-hidden />
    </button>
  );

  return (
    <section
      className="mx-3 mt-3 shrink-0 rounded-lg border border-line bg-surface"
      aria-label={t("onb.title")}
      data-testid="onboarding-card"
    >
      {!open ? (
        <div className="flex items-center gap-1 px-1.5 py-1.5">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-raised"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            aria-label={t("onb.title")}
          >
            {ring}
            <span className="num shrink-0 text-xs text-muted" data-testid="onboarding-count">
              {doneCount}/{total}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {t("onb.title")}
            </span>
            <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden />
          </button>
          {close}
        </div>
      ) : complete ? (
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <Mark className="h-6 w-6 text-ink" />
            {close}
          </div>
          <p className="mt-2 text-[13px] font-medium">{t("onb.done.t")}</p>
          <p className="mt-1 text-xs leading-4 text-muted">{t("onb.done.d")}</p>
          <button type="button" className="btn btn-sm mt-3" onClick={dismissOnboarding}>
            {t("onb.done.dismiss")}
          </button>
        </div>
      ) : (
        <div className="p-3">
          <div className="flex items-center gap-2">
            {ring}
            <span className="num text-xs text-muted">
              {doneCount}/{total}
            </span>
            <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t("onb.title")}</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0"
              onClick={() => setOpen(false)}
              aria-label={t("onb.collapse")}
              aria-expanded
            >
              <ChevronUp size={14} aria-hidden />
            </button>
            {close}
          </div>
          <ul className="mt-2 space-y-0.5">
            {tasks.map((task) => {
              const now = task.id === current;
              return (
                <li
                  key={task.id}
                  data-testid={`onboarding-task-${task.id}`}
                  className={`rounded-md px-2 py-1.5 ${now ? "bg-accent-soft py-2" : ""}`}
                >
                  <p
                    className={`flex items-center gap-1.5 text-[13px] ${
                      isDone(task.id)
                        ? "text-muted line-through"
                        : now
                          ? "font-medium text-ink"
                          : "text-muted"
                    }`}
                  >
                    {isDone(task.id) && (
                      <Check size={12} className="shrink-0 text-[var(--positive)]" aria-hidden />
                    )}
                    {t(task.title)}
                  </p>
                  {now && (
                    <div className="mt-1 flex flex-col items-end gap-1">
                      <p className="self-stretch text-xs leading-4 text-muted">{t(task.hint)}</p>
                      {task.guide && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm shrink-0"
                          onClick={() => showMe(task.id)}
                        >
                          {t("onb.show")}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** A plain SVG ring; the dash offset transition is the one completion
 *  animation (500 ms, disabled under prefers-reduced-motion). */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? done / total : 0;
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 -rotate-90" aria-hidden>
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        strokeWidth="2.5"
        className="stroke-[var(--control)]"
      />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        stroke="var(--accent)"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
      />
    </svg>
  );
}
