import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSummary, formatWeeklySummary, getSaturdayOfWeek, parseTaskTitle, selectTasksForSummary, selectTasksForWeeklySummary, type TaskRecord } from "./domain";

test("parses only titles whose course marker is the strict suffix", () => {
  assert.deepEqual(parseTaskTitle(" !  Exam [ cs 1100 ] "), { name: "Exam", course: "cs 1100", completed: true });
  assert.equal(parseTaskTitle("Exam [CS 1100] later"), null);
  assert.equal(parseTaskTitle("Exam without course"), null);
});

test("selects the inclusive date window, then the earliest fallback per course", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const tasks: TaskRecord[] = [
    { id: "a", course: "CS 2214", name: "Today", dueAt: new Date("2026-09-02T08:00:00Z"), completed: false },
    { id: "b", course: "cs 2214", name: "Window end", dueAt: new Date("2026-09-11T23:59:00Z"), completed: false },
    { id: "c", course: "CS 2214", name: "*Fallback", dueAt: new Date("2026-12-01T08:00:00Z"), completed: true },
  ];
  const result = selectTasksForSummary(tasks, now, 10, 3);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].tasks.map(task => task.id), ["a", "b", "c"]);
  const summary = formatSummary(result, [], 10, "2026-09-02", "UTC");
  assert.match(summary, /\* Today: Wed, Sep 2, 8:00 AM/);
  assert.match(summary, /<i>\* <b>\*Fallback<\/b>: Tue, Dec 1, 8:00 AM \[CS 2214\]<\/i>/);
});

test("selects summary dates in the user's timezone", () => {
  const now = new Date("2026-09-03T03:30:00Z");
  const tasks: TaskRecord[] = [
    { id: "today", course: "CS 2214", name: "Still today", dueAt: new Date("2026-09-03T03:45:00Z"), completed: false },
    { id: "tomorrow", course: "CS 2214", name: "Tomorrow", dueAt: new Date("2026-09-04T04:30:00Z"), completed: false },
  ];

  const result = selectTasksForSummary(tasks, now, 0, 1, "America/New_York");
  assert.deepEqual(result[0].tasks.map(task => task.id), ["today"]);
});

test("selects the inclusive Saturday through following Sunday weekly range", () => {
  const tasks: TaskRecord[] = [
    { id: "before", course: "CS 2214", name: "Before", dueAt: new Date("2026-09-04T12:00:00Z"), completed: false },
    { id: "start", course: "CS 2214", name: "Start", dueAt: new Date("2026-09-05T12:00:00Z"), completed: false },
    { id: "end", course: "CS 2214", name: "End", dueAt: new Date("2026-09-13T12:00:00Z"), completed: false },
    { id: "after", course: "CS 2214", name: "After", dueAt: new Date("2026-09-14T12:00:00Z"), completed: false },
    { id: "done", course: "CS 2214", name: "Done", dueAt: new Date("2026-09-06T12:00:00Z"), completed: true },
  ];
  assert.equal(getSaturdayOfWeek("2026-09-09"), "2026-09-05");
  const result = selectTasksForWeeklySummary(tasks, "2026-09-05");
  assert.deepEqual(result[0].tasks.map(task => task.id), ["start", "done", "end"]);
  const summary = formatWeeklySummary(result);
  assert.match(summary, /\* Start: Sat, Sep 5, 12:00 PM/);
  assert.doesNotMatch(summary, /Done|Before|After/);
});