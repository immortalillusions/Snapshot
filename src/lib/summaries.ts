import { createCalendarClient, summaryMarker } from "./google";
import { addCalendarDays, formatSummary, getDateInTimeZone, selectTasksForSummary, type TaskRecord } from "./domain";
import { pool } from "./db";

export async function regenerateSummaries(userId: string, now = new Date()) {
  const result = await pool.query("select u.*, s.calendar_id from users u join calendar_sync_state s on s.user_id = u.id where u.id = $1", [userId]);
  const user = result.rows[0];
  if (!user) throw new Error("User not found");
  const settings = user.settings;
  const tasksResult = await pool.query("select t.id, t.name, t.due_at, t.completed, c.name as course from tasks t join courses c on c.id = t.course_id where t.user_id = $1", [userId]);
  const tasks: TaskRecord[] = tasksResult.rows.map(row => ({ id: row.id, name: row.name, course: row.course, dueAt: new Date(row.due_at), completed: row.completed }));
  const calendar = createCalendarClient(user.access_token, user.refresh_token);
  const order = settings.courseOrder ?? [];
  for (const [day, offset] of [["today", 0], ["tomorrow", 1]] as const) {
    const date = addCalendarDays(getDateInTimeZone(now, user.timezone), offset);
    const sections = selectTasksForSummary(tasks, now, settings.lookaheadDays ?? 10, settings.minimumPerCourse ?? 2, user.timezone, date);
    const description = formatSummary(sections, order, settings.lookaheadDays ?? 10, date, user.timezone) || "No upcoming tasks.";
    const start = `${date}T${settings.summaryStartTime ?? "09:30"}:00`;
    const end = addWallClockMinutes(start, settings.summaryDurationMinutes ?? 30);
    const marker = summaryMarker(userId, day);
    const existing = await calendar.events.list({ calendarId: user.calendar_id, privateExtendedProperty: [`snapshotMarker=${marker}`], maxResults: 1 });
    const body = { summary: day === "today" ? "Today" : "Tomorrow", description, start: { dateTime: start, timeZone: user.timezone }, end: { dateTime: end, timeZone: user.timezone }, extendedProperties: { private: { snapshotMarker: marker } } };
    if (existing.data.items?.[0]?.id) await calendar.events.update({ calendarId: user.calendar_id, eventId: existing.data.items[0].id, requestBody: body });
    else await calendar.events.insert({ calendarId: user.calendar_id, requestBody: body });
  }
}

function addWallClockMinutes(value: string, minutes: number) {
  const wallClock = new Date(`${value}Z`);
  wallClock.setUTCMinutes(wallClock.getUTCMinutes() + minutes);
  return wallClock.toISOString().replace(".000Z", "");
}