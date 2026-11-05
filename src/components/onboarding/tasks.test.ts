import { describe, expect, it } from "vitest";
import { availableTasks, tourProgress, truthsToIds, TASK_IDS, type TaskId } from "./tasks";

describe("availableTasks", () => {
  it("counts the AI review only when AI is configured", () => {
    expect(availableTasks(true)).toHaveLength(TASK_IDS.length);
    const without = availableTasks(false);
    expect(without).toHaveLength(TASK_IDS.length - 1);
    expect(without.map((t) => t.id)).not.toContain("review");
  });

  it("keeps the task order stable (ids are the persisted contract)", () => {
    expect(availableTasks(true).map((t) => t.id)).toEqual([...TASK_IDS]);
  });
});

describe("tourProgress", () => {
  it("starts at 0/10 with the first task current", () => {
    const tasks = availableTasks(true);
    const p = tourProgress([], tasks);
    expect(p.doneCount).toBe(0);
    expect(p.total).toBe(10);
    expect(p.current).toBe("create-project");
  });

  it("counts only known ids and picks the first undone as current", () => {
    const tasks = availableTasks(true);
    const p = tourProgress(["create-project", "bogus-task", "compile", "library"], tasks);
    expect(p.doneCount).toBe(3); // the unknown id is ignored
    expect(p.current).toBe("pdf-click");
    expect(p.isDone("library")).toBe(true);
    expect(p.isDone("pdf-click")).toBe(false);
  });

  it("is complete with no current task when everything counted is done", () => {
    const p = tourProgress([...TASK_IDS], availableTasks(true));
    expect(p.doneCount).toBe(10);
    expect(p.current).toBeNull();
  });

  it("reaches 100% without the AI-only review when AI is off", () => {
    const noAi = availableTasks(false).map((t) => t.id) as TaskId[];
    const p = tourProgress(noAi, availableTasks(false));
    expect(p.doneCount).toBe(9);
    expect(p.current).toBeNull();
  });
});

describe("truthsToIds", () => {
  it("settles exactly the true facts", () => {
    expect(truthsToIds({ "create-project": true, compile: false, snapshot: true })).toEqual([
      "create-project",
      "snapshot",
    ]);
  });

  it("never settles anything from an empty set", () => {
    expect(truthsToIds({})).toEqual([]);
  });
});
