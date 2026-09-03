import { randomUUID } from "crypto";
import { createCalendarClient } from "./google";
import { courseKey, getDateInTimeZone, getSaturdayOfWeek, parseTaskTitle } from "./domain";
import { pool, withTransaction } from "./db";

export async function syncCalendar(userId: string, fullSync = false, now = new Date()) {
  const pastEventCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const stateResult = await pool.query("select s.*, u.access_token, u.refresh_token, u.timezone from calendar_sync_state s join users u on u.id = s.user_id where s.user_id = $1", [userId]);
  const state = stateResult.rows[0];
  if (!state) throw new Error("Calendar sync state not found");
  const calendar = createCalendarClient(state.access_token, state.refresh_token);
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const weeklyWeekStarts = new Set<string>();
  let items: Array<{ id?: string | null; status?: string | null; summary?: string | null; start?: { date?: string | null; dateTime?: string | null } | null }> = [];
  do {
    const response = await calendar.events.list({ calendarId: state.calendar_id, showDeleted: true, singleEvents: true, pageToken, syncToken: fullSync ? undefined : state.sync_token ?? undefined, maxResults: 2500 });
    items = items.concat(response.data.items ?? []);
    pageToken = response.data.nextPageToken ?? undefined;
    nextSyncToken = response.data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  await withTransaction(async client => {
    for (const event of items) {
      if (!event.id) continue;
      const previous = (await client.query("select due_at from tasks where user_id = $1 and google_event_id = $2", [userId, event.id])).rows[0];
      if (previous) weeklyWeekStarts.add(getSaturdayOfWeek(getDateInTimeZone(new Date(previous.due_at), state.timezone)));
      if (event.status === "cancelled") { await client.query("delete from tasks where user_id = $1 and google_event_id = $2", [userId, event.id]); continue; }
      const parsed = parseTaskTitle(event.summary ?? "");
      if (!parsed || (!event.start?.date && !event.start?.dateTime)) { await client.query("delete from tasks where user_id = $1 and google_event_id = $2", [userId, event.id]); continue; }
      const dueAt = event.start.dateTime ?? `${event.start.date}T00:00:00.000Z`;
      if (new Date(dueAt).getTime() <= pastEventCutoff) { continue; }
      weeklyWeekStarts.add(getSaturdayOfWeek(getDateInTimeZone(new Date(dueAt), state.timezone)));
      const course = await client.query("insert into courses (user_id, name, normalized_name) values ($1, $2, $3) on conflict (user_id, normalized_name) do update set name = excluded.name returning id", [userId, parsed.course, courseKey(parsed.course)]);
      await client.query("insert into tasks (user_id, course_id, name, due_at, completed, google_event_id) values ($1, $2, $3, $4, $5, $6) on conflict (user_id, google_event_id) do update set course_id = excluded.course_id, name = excluded.name, due_at = excluded.due_at, completed = excluded.completed, updated_at = now()", [userId, course.rows[0].id, parsed.name, dueAt, parsed.completed, event.id]);
    }
    await client.query("update calendar_sync_state set sync_token = $1, updated_at = now() where user_id = $2", [nextSyncToken, userId]);
  });
  return { changed: items.length, syncToken: nextSyncToken, weeklyWeekStarts: [...weeklyWeekStarts] };
}

export async function reconcileCalendar(userId: string) {
  try { return await syncCalendar(userId); }
  catch (error: unknown) { const status = (error as { code?: number; response?: { status?: number } }).response?.status ?? (error as { code?: number }).code; if (status === 410) { await pool.query("update calendar_sync_state set sync_token = null where user_id = $1", [userId]); return syncCalendar(userId, true); } throw error; }
}

export async function registerCalendarWatch(userId: string) {
  const result = await pool.query("select s.*, u.access_token, u.refresh_token from calendar_sync_state s join users u on u.id = s.user_id where s.user_id = $1", [userId]);
  const state = result.rows[0];
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) throw new Error("APP_URL is required for Calendar webhooks");
  if (process.env.NODE_ENV === "production" && !appUrl.startsWith("https://")) throw new Error("APP_URL must be a public HTTPS URL for Calendar webhooks");
  const calendar = createCalendarClient(state.access_token, state.refresh_token);
  if (state.channel_id && state.channel_resource_id) {
    try { await calendar.channels.stop({ requestBody: { id: state.channel_id, resourceId: state.channel_resource_id } }); } catch { /* The old channel may already be expired. */ }
  }
  const webhookAddress = `${appUrl}/api/webhooks/google-calendar`;
  console.info("Registering Google Calendar watch", { webhookAddress, calendarId: state.calendar_id });
  const response = await calendar.events.watch({ calendarId: state.calendar_id, requestBody: { id: randomUUID(), type: "web_hook", address: webhookAddress, token: userId } });
  console.info("Google Calendar watch registered", { channelId: response.data.id, resourceId: response.data.resourceId, expiration: response.data.expiration });
  await pool.query("update calendar_sync_state set channel_id = $1, channel_resource_id = $2, channel_expires_at = to_timestamp($3::double precision / 1000), updated_at = now() where user_id = $4", [response.data.id, response.data.resourceId, response.data.expiration, userId]);
}

export async function renewCalendarWatchIfNeeded(userId: string) {
  const result = await pool.query("select channel_expires_at from calendar_sync_state where user_id = $1", [userId]);
  const expiresAt = result.rows[0]?.channel_expires_at ? new Date(result.rows[0].channel_expires_at).getTime() : 0;
  if (expiresAt < Date.now() + 24 * 60 * 60 * 1000) await registerCalendarWatch(userId);
}