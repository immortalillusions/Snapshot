/** Google Calendar synchronization, course maintenance, and watch lifecycle. */

import { randomUUID } from "crypto";
import { createCalendarClient } from "./google";
import { courseKey, getDateInTimeZone, getSaturdayOfWeek, parseTaskTitle } from "./domain";
import { pool, withTransaction } from "./db";
import type { Pool, PoolClient } from "pg";

type CalendarClient = ReturnType<typeof createCalendarClient>;

/** Removes empty courses and keeps the saved course order aligned with active courses. */
export async function synchronizeCourses(client: Pool | PoolClient, userId: string, newCourseNames = new Map<string, string>()) {
  await client.query("delete from courses c where c.user_id = $1 and not exists (select 1 from tasks t where t.course_id = c.id)", [userId]);
  const settingsResult = await client.query("select settings from users where id = $1 for update", [userId]);
  const settings = (settingsResult.rows[0]?.settings ?? {}) as { courseOrder?: unknown };
  const courseOrder = Array.isArray(settings.courseOrder)
    ? settings.courseOrder.filter((course): course is string => typeof course === "string")
    : [];
  const courseRows = await client.query<{ name: string; normalized_name: string }>("select name, normalized_name from courses where user_id = $1", [userId]);
  const activeCourseNames = new Map<string, string>(courseRows.rows.map(course => [course.normalized_name, course.name]));
  const nextCourseOrder = courseOrder.filter(course => activeCourseNames.has(courseKey(course)));
  const orderKeys = new Set(nextCourseOrder.map(courseKey));
  for (const [key, name] of newCourseNames) {
    if (activeCourseNames.has(key) && !orderKeys.has(key)) nextCourseOrder.push(name);
  }
  if (JSON.stringify(nextCourseOrder) !== JSON.stringify(courseOrder)) {
    await client.query("update users set settings = settings || jsonb_build_object('courseOrder', $1::jsonb), updated_at = now() where id = $2", [JSON.stringify(nextCourseOrder), userId]);
  }
}

/** Applies a full or incremental Calendar event page set to local tasks. */
export async function syncCalendar(userId: string, fullSync = false, now = new Date()) {
  const pastEventCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const stateResult = await pool.query("select s.*, u.access_token, u.refresh_token, u.timezone from calendar_sync_state s join users u on u.id = s.user_id where s.user_id = $1", [userId]);
  const state = stateResult.rows[0];
  if (!state) throw new Error("Calendar sync state not found");
  const calendar = createCalendarClient(state.access_token, state.refresh_token);
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const weeklyWeekStarts = new Set<string>();
  const newCourseNames = new Map<string, string>();
  let items: Array<{ id?: string | null; status?: string | null; summary?: string | null; start?: { date?: string | null; dateTime?: string | null } | null }> = [];
  // Fetch every page before committing the new sync token.
  do {
    const response = await calendar.events.list({ calendarId: state.calendar_id, showDeleted: true, singleEvents: true, pageToken, syncToken: fullSync ? undefined : state.sync_token ?? undefined, timeMin: fullSync ? new Date(pastEventCutoff).toISOString() : undefined, maxResults: 2500 });
    items = items.concat(response.data.items ?? []);
    pageToken = response.data.nextPageToken ?? undefined;
    nextSyncToken = response.data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  await withTransaction(async client => {
    for (const event of items) {
      if (!event.id) continue;
      // Track both old and new weeks so moved tasks refresh each affected summary.
      const previous = (await client.query("select due_at from tasks where user_id = $1 and google_event_id = $2", [userId, event.id])).rows[0];
      if (previous) weeklyWeekStarts.add(getSaturdayOfWeek(getDateInTimeZone(new Date(previous.due_at), state.timezone)));
      if (event.status === "cancelled") { await client.query("delete from tasks where user_id = $1 and google_event_id = $2", [userId, event.id]); continue; }
      const parsed = parseTaskTitle(event.summary ?? "");
      if (!parsed || (!event.start?.date && !event.start?.dateTime)) { await client.query("delete from tasks where user_id = $1 and google_event_id = $2", [userId, event.id]); continue; }
      const dueAt = event.start.dateTime ?? `${event.start.date}T00:00:00.000Z`;
      const dueDate = new Date(dueAt);
      if (Number.isNaN(dueDate.getTime())) {
        console.error("Invalid Calendar event date", { eventId: event.id, dateTime: event.start.dateTime, date: event.start.date });
        continue;
      }
      if (dueDate.getTime() <= pastEventCutoff) { continue; }
      weeklyWeekStarts.add(getSaturdayOfWeek(getDateInTimeZone(dueDate, state.timezone)));
      const course = await client.query("insert into courses (user_id, name, normalized_name) values ($1, $2, $3) on conflict (user_id, normalized_name) do update set name = excluded.name returning id, xmax = 0 as inserted", [userId, parsed.course, courseKey(parsed.course)]);
      if (course.rows[0].inserted) newCourseNames.set(courseKey(parsed.course), parsed.course);
      await client.query("insert into tasks (user_id, course_id, name, due_at, completed, google_event_id) values ($1, $2, $3, $4, $5, $6) on conflict (user_id, google_event_id) do update set course_id = excluded.course_id, name = excluded.name, due_at = excluded.due_at, completed = excluded.completed, updated_at = now()", [userId, course.rows[0].id, parsed.name, dueAt, parsed.completed, event.id]);
    }
    await synchronizeCourses(client, userId, newCourseNames);
    await client.query("update calendar_sync_state set sync_token = $1, updated_at = now() where user_id = $2", [nextSyncToken, userId]);
  });
  return { changed: items.length, syncToken: nextSyncToken, weeklyWeekStarts: [...weeklyWeekStarts] };
}

/** Reconciles incrementally, falling back to a full sync for an expired token. */
export async function reconcileCalendar(userId: string) {
  try { return await syncCalendar(userId); }
  catch (error: unknown) { const status = (error as { code?: number; response?: { status?: number } }).response?.status ?? (error as { code?: number }).code; if (status === 410) { await pool.query("update calendar_sync_state set sync_token = null where user_id = $1", [userId]); return syncCalendar(userId, true); } throw error; }
}

/** Stops a Calendar watch, tolerating channels that have already expired. */
async function stopCalendarWatch(calendar: CalendarClient, channelId: string, resourceId: string) {
  try {
    await calendar.channels.stop({
      requestBody: { id: channelId, resourceId },
    });
  } catch {
    // Google may expire or remove a channel before local state is refreshed.
  }
}

/** Replaces the user's Calendar watch and stores the new channel metadata. */
export async function registerCalendarWatch(userId: string) {
  const result = await pool.query("select s.*, u.access_token, u.refresh_token from calendar_sync_state s join users u on u.id = s.user_id where s.user_id = $1", [userId]);
  const state = result.rows[0];
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) throw new Error("APP_URL is required for Calendar webhooks");
  if (process.env.NODE_ENV === "production" && !appUrl.startsWith("https://")) throw new Error("APP_URL must be a public HTTPS URL for Calendar webhooks");
  const calendar = createCalendarClient(state.access_token, state.refresh_token);
  if (state.channel_id && state.channel_resource_id) {
    await stopCalendarWatch(calendar, state.channel_id, state.channel_resource_id);
  }
  const webhookAddress = `${appUrl}/api/webhooks/google-calendar`;
  console.info("Registering Google Calendar watch", { webhookAddress, calendarId: state.calendar_id });
  const response = await calendar.events.watch({ calendarId: state.calendar_id, requestBody: { id: randomUUID(), type: "web_hook", address: webhookAddress, token: userId } });
  console.info("Google Calendar watch registered", { channelId: response.data.id, resourceId: response.data.resourceId, expiration: response.data.expiration });
  await pool.query("update calendar_sync_state set channel_id = $1, channel_resource_id = $2, channel_expires_at = to_timestamp($3::double precision / 1000), updated_at = now() where user_id = $4", [response.data.id, response.data.resourceId, response.data.expiration, userId]);
}

/** Renews watches that expire within the next day. */
export async function renewCalendarWatchIfNeeded(userId: string) {
  const result = await pool.query("select channel_expires_at from calendar_sync_state where user_id = $1", [userId]);
  const expiresAt = result.rows[0]?.channel_expires_at ? new Date(result.rows[0].channel_expires_at).getTime() : 0;
  if (expiresAt < Date.now() + 24 * 60 * 60 * 1000) await registerCalendarWatch(userId);
}

/** Stops the user's watch and removes local synchronization state. */
export async function disconnectCalendar(userId: string) {
  const result = await pool.query("select s.channel_id, s.channel_resource_id, u.access_token, u.refresh_token from calendar_sync_state s join users u on u.id = s.user_id where s.user_id = $1", [userId]);
  const state = result.rows[0];
  if (!state) return false;
  if (state.channel_id && state.channel_resource_id) {
    const calendar = createCalendarClient(state.access_token, state.refresh_token);
    await stopCalendarWatch(calendar, state.channel_id, state.channel_resource_id);
  }
  await withTransaction(async client => {
    await client.query("delete from calendar_sync_state where user_id = $1", [userId]);
  });
  return true;
}