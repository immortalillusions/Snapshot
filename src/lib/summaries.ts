/** Creates and updates daily and weekly Google Calendar summary events. */

import { createCalendarClient, summaryMarker, weeklySummaryMarker } from "./google";
import { addCalendarDays, formatSummary, formatWeeklySummary, getDateInTimeZone, getSaturdayOfWeek, selectTasksForSummary, selectTasksForWeeklySummary, type TaskRecord } from "./domain";
import { pool } from "./db";

type SummaryOptions = { weeklyWeekStarts?: string[] };
type SummaryUser = { access_token: string; refresh_token: string; calendar_id: string; timezone: string };
type SummarySettings = { courseOrder?: string[]; lookaheadDays?: number; minimumPerCourse?: number; summaryStartTime?: string; weeklySummaryStartTime?: string; summaryDurationMinutes?: number };
type ResolvedSummarySettings = Required<SummarySettings>;

/** Applies defaults and validates stored summary times. */
function resolveSummarySettings(settings: SummarySettings): ResolvedSummarySettings {
  return {
    courseOrder: settings.courseOrder ?? [],
    lookaheadDays: settings.lookaheadDays ?? 10,
    minimumPerCourse: settings.minimumPerCourse ?? 2,
    summaryStartTime: validSummaryTime(settings.summaryStartTime, "09:30"),
    weeklySummaryStartTime: validSummaryTime(
      settings.weeklySummaryStartTime,
      "09:30",
    ),
    summaryDurationMinutes: settings.summaryDurationMinutes ?? 30,
  };
}

/** Regenerates daily summaries and either all or selected weekly summaries. */
export async function regenerateSummaries(userId: string, now = new Date(), options: SummaryOptions = {}) {
  const result = await pool.query("select u.*, s.calendar_id from users u join calendar_sync_state s on s.user_id = u.id where u.id = $1", [userId]);
  const user = result.rows[0];
  if (!user) throw new Error("User not found");
  const settings = resolveSummarySettings(user.settings ?? {});
  const tasksResult = await pool.query("select t.id, t.name, t.due_at, t.completed, c.name as course from tasks t join courses c on c.id = t.course_id where t.user_id = $1", [userId]);
  const tasks: TaskRecord[] = tasksResult.rows.map(row => ({ id: row.id, name: row.name, course: row.course, dueAt: new Date(row.due_at), completed: row.completed })).filter(task => {
    if (Number.isNaN(task.dueAt.getTime())) {
      console.error("Invalid stored task date", { taskId: task.id });
      return false;
    }
    return true;
  });
  const calendar = createCalendarClient(user.access_token, user.refresh_token);
  const order = settings.courseOrder;
  await regenerateDailySummaries(calendar, user, userId, tasks, order, settings, now);

  const weekStarts = options.weeklyWeekStarts === undefined
    ? await getAllWeeklySummaryWeeks(userId, now, user.timezone)
    : [...new Set(options.weeklyWeekStarts.map(getSaturdayOfWeek))];
  for (const weekStart of weekStarts) await upsertWeeklySummary(calendar, user, userId, tasks, order, settings, weekStart);
}

/** Upserts the Today and Tomorrow events for their respective calendar dates. */
async function regenerateDailySummaries(calendar: ReturnType<typeof createCalendarClient>, user: SummaryUser, userId: string, tasks: TaskRecord[], order: string[], settings: ResolvedSummarySettings, now: Date) {
  for (const [day, offset] of [["today", 0], ["tomorrow", 1]] as const) {
    const date = addCalendarDays(getDateInTimeZone(now, user.timezone), offset);
    const sections = selectTasksForSummary(tasks, now, settings.lookaheadDays, settings.minimumPerCourse, user.timezone, date);
    const description = formatSummary(sections, order, settings.lookaheadDays, date, user.timezone) || "No upcoming tasks.";
    const start = `${date}T${settings.summaryStartTime}:00`;
    const end = addWallClockMinutes(start, settings.summaryDurationMinutes);
    await upsertCalendarEvent(calendar, user.calendar_id, summaryMarker(userId, day), day === "today" ? "Today" : "Tomorrow", description, start, end, user.timezone);
  }
}

/** Upserts one requested or automatically managed weekly summary. */
async function upsertWeeklySummary(calendar: ReturnType<typeof createCalendarClient>, user: SummaryUser, userId: string, tasks: TaskRecord[], order: string[], settings: ResolvedSummarySettings, weekStart: string) {
  const sections = selectTasksForWeeklySummary(tasks, weekStart, user.timezone);
  const description = formatWeeklySummary(sections, order, user.timezone) || "No upcoming tasks.";
  const start = `${weekStart}T${settings.weeklySummaryStartTime}:00`;
  const end = addWallClockMinutes(start, settings.summaryDurationMinutes);
  const title = `Week of ${new Intl.DateTimeFormat("en", { timeZone: user.timezone, month: "short", day: "numeric", year: "numeric" }).format(new Date(`${weekStart}T12:00:00Z`))}`;
  await upsertCalendarEvent(calendar, user.calendar_id, weeklySummaryMarker(userId, weekStart), title, description, start, end, user.timezone);
}

/** Finds a generated event by marker and updates or inserts it idempotently. */
async function upsertCalendarEvent(calendar: ReturnType<typeof createCalendarClient>, calendarId: string, marker: string, summary: string, description: string, start: string, end: string, timeZone: string) {
  const existing = await calendar.events.list({ calendarId, privateExtendedProperty: [`snapshotMarker=${marker}`], maxResults: 1 });
  const body = { summary, description, start: { dateTime: start, timeZone }, end: { dateTime: end, timeZone }, extendedProperties: { private: { snapshotMarker: marker } } };
  if (existing.data.items?.[0]?.id) await calendar.events.update({ calendarId, eventId: existing.data.items[0].id, requestBody: body });
  else await calendar.events.insert({ calendarId, requestBody: body });
}

/** Returns automatic weeks through four months ahead plus requested weeks. */
async function getAllWeeklySummaryWeeks(userId: string, now: Date, timeZone: string) {
  const currentDate = getDateInTimeZone(now, timeZone);
  const currentWeek = getSaturdayOfWeek(currentDate);
  const cutoff = addCalendarMonths(currentDate, 4);
  const weeks = new Set<string>();
  for (let week = currentWeek; week <= cutoff; week = addCalendarDays(week, 7)) weeks.add(week);
  const requested = await pool.query("select week_start from requested_weekly_summaries where user_id = $1", [userId]);
  for (const row of requested.rows) {
    const weekStart = row.week_start instanceof Date ? getDateInTimeZone(row.week_start, "UTC") : String(row.week_start).slice(0, 10);
    weeks.add(getSaturdayOfWeek(weekStart));
  }
  return [...weeks].sort();
}

/** Adds calendar months to an ISO date using a stable UTC midday. */
function addCalendarMonths(date: string, months: number) {
  const result = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(result.getTime())) {
    console.error("Invalid summary cutoff date", { date, months });
    throw new Error(`Invalid summary cutoff date: ${date}`);
  }
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString().slice(0, 10);
}

/** Adds minutes to a wall-clock timestamp without applying host time-zone rules. */
function addWallClockMinutes(value: string, minutes: number) {
  const wallClock = new Date(`${value}Z`);
  if (Number.isNaN(wallClock.getTime())) {
    console.error("Invalid summary timing", { value, minutes });
    throw new Error(`Invalid summary event start: ${value}`);
  }
  wallClock.setUTCMinutes(wallClock.getUTCMinutes() + minutes);
  return wallClock.toISOString().replace(".000Z", "");
}

/** Returns a valid 24-hour summary time or its fallback. */
function validSummaryTime(value: string | undefined, fallback: string) {
  return value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}