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

export function selectTasksForSummary(tasks: TaskRecord[], now: Date, lookaheadDays: number, minimumPerCourse: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + lookaheadDays);
  end.setHours(23, 59, 59, 999);

  const byCourse = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const key = courseKey(task.course);
    const courseTasks = byCourse.get(key) ?? [];
    courseTasks.push(task);
    byCourse.set(key, courseTasks);
  }

  return [...byCourse.entries()].map(([key, courseTasks]) => {
    const sorted = [...courseTasks].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const selected = sorted.filter(task => task.dueAt >= start && task.dueAt <= end);
    for (const task of sorted) {
      if (selected.length >= minimumPerCourse) break;
      if (!selected.includes(task)) selected.push(task);
    }
    return { course: courseTasks[0].course, key, tasks: selected.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()) };
  });
}

export function formatSummary(sections: ReturnType<typeof selectTasksForSummary>, order: string[] = []) {
  const orderIndex = new Map(order.map((course, index) => [courseKey(course), index]));
  const ordered = [...sections].sort((a, b) => (orderIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER));
  const incomplete = ordered.filter(section => section.tasks.some(task => !task.completed));
  const lines = incomplete.flatMap(section => [section.course + ":", ...section.tasks.filter(task => !task.completed).map(task => `* ${task.name}: ${formatDueAt(task.dueAt)}`), ""]);
  const completed = sections.flatMap(section => section.tasks.filter(task => task.completed)).sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  if (completed.length) lines.push("Completed:", ...completed.map(task => `* ${task.name} [${task.course}]: ${formatDueAt(task.dueAt)}`));
  return lines.join("\n").trim();
}

function formatDueAt(value: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}