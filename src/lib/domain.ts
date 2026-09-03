export type TaskRecord = {
  id: string;
  course: string;
  name: string;
  dueAt: Date;
  completed: boolean;
};

export type ParsedTaskTitle = { name: string; course: string; completed: boolean } | null;

const taskTitlePattern = /^(\!)?\s*(.+?)\s*\[\s*([^\]]+?)\s*\]$/;

export function parseTaskTitle(title: string): ParsedTaskTitle {
  const match = title.trim().match(taskTitlePattern);
  if (!match) return null;
  const name = match[2].trim();
  const course = match[3].trim();
  return name && course ? { name, course, completed: Boolean(match[1]) } : null;
}

export function courseKey(course: string): string {
  return course.trim().toLocaleLowerCase();
}

export function getDateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const dateParts = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

export function addCalendarDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function getSaturdayOfWeek(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const daysSinceSaturday = (value.getUTCDay() + 1) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceSaturday);
  return value.toISOString().slice(0, 10);
}

export function getWeeklySummaryRange(weekStart: string) {
  const startDate = getSaturdayOfWeek(weekStart);
  return { startDate, endDate: addCalendarDays(startDate, 8) };
}

export function selectTasksForSummary(tasks: TaskRecord[], now: Date, lookaheadDays: number, minimumPerCourse: number, timeZone = "UTC", summaryDate = getDateInTimeZone(now, timeZone)) {
  const startDate = summaryDate;
  const endDate = addCalendarDays(startDate, lookaheadDays);

  const byCourse = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const key = courseKey(task.course);
    const courseTasks = byCourse.get(key) ?? [];
    courseTasks.push(task);
    byCourse.set(key, courseTasks);
  }

  return [...byCourse.entries()].map(([key, courseTasks]) => {
    const sorted = [...courseTasks].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const selected = sorted.filter(task => {
      const dueDate = getDateInTimeZone(task.dueAt, timeZone);
      return dueDate >= startDate && dueDate <= endDate;
    });
    for (const task of sorted) {
      if (selected.length >= minimumPerCourse) break;
      if (!selected.includes(task)) selected.push(task);
    }
    return { course: courseTasks[0].course, key, tasks: selected.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()) };
  });
}

export function formatSummary(sections: ReturnType<typeof selectTasksForSummary>, order: string[] = [], lookaheadDays = 10, summaryDate?: string, timeZone = "UTC") {
  const orderIndex = new Map(order.map((course, index) => [courseKey(course), index]));
  const ordered = [...sections].sort((a, b) => (orderIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER));
  const incomplete = ordered.filter(section => section.tasks.some(task => !task.completed));
  const endDate = summaryDate ? addCalendarDays(summaryDate, lookaheadDays) : undefined;
  const lines = incomplete.flatMap(section => [section.course + ":", ...section.tasks.filter(task => !task.completed).map(task => formatSummaryTask(task, endDate, timeZone)), ""]);
  const completed = sections.flatMap(section => section.tasks.filter(task => task.completed)).sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  if (completed.length) lines.push("Completed:", ...completed.map(task => formatSummaryTask(task, endDate, timeZone, ` [${escapeHtml(task.course)}]`)));
  return lines.join("\n").trim();
}

function formatDueAt(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}

function formatSummaryTask(task: TaskRecord, endDate: string | undefined, timeZone: string, suffix = "") {
  const name = escapeHtml(task.name);
  const formattedName = task.name.trimStart().startsWith("*") ? `<b>${name}</b>` : name;
  const line = `* ${formattedName}: ${formatDueAt(task.dueAt, timeZone)}${suffix}`;
  return endDate && getDateInTimeZone(task.dueAt, timeZone) > endDate ? `<i>${line}</i>` : line;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function selectTasksForWeeklySummary(tasks: TaskRecord[], weekStart: string, timeZone = "UTC") {
  const range = getWeeklySummaryRange(weekStart);
  const byCourse = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const dueDate = getDateInTimeZone(task.dueAt, timeZone);
    if (dueDate < range.startDate || dueDate > range.endDate) continue;
    const key = courseKey(task.course);
    const courseTasks = byCourse.get(key) ?? [];
    courseTasks.push(task);
    byCourse.set(key, courseTasks);
  }
  return [...byCourse.entries()].map(([key, courseTasks]) => ({
    course: courseTasks[0].course,
    key,
    tasks: courseTasks.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
  }));
}

export function formatWeeklySummary(sections: ReturnType<typeof selectTasksForWeeklySummary>, order: string[] = [], timeZone = "UTC") {
  const orderIndex = new Map(order.map((course, index) => [courseKey(course), index]));
  const ordered = [...sections].sort((a, b) => (orderIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER));
  return ordered
    .filter(section => section.tasks.some(task => !task.completed))
    .flatMap(section => [section.course + ":", ...section.tasks.filter(task => !task.completed).map(task => formatSummaryTask(task, undefined, timeZone)), ""])
    .join("\n")
    .trim();
}