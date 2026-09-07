import { NextResponse } from "next/server";
import { createOAuthClient } from "@/lib/google";
import { pool } from "@/lib/db";
import { setSession } from "@/lib/session";
import { registerCalendarWatch, syncCalendar } from "@/lib/sync";
import { regenerateSummaries } from "@/lib/summaries";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 });
  const oauth = createOAuthClient(); const { tokens } = await oauth.getToken(code); oauth.setCredentials(tokens);
  const profile = await (await import("googleapis")).google.oauth2({ version: "v2", auth: oauth }).userinfo.get();
  const existing = await pool.query("select u.id from users u join calendar_sync_state s on s.user_id = u.id where u.google_sub = $1", [profile.data.id]);
  if (existing.rows[0]) {
    const userId = existing.rows[0].id;
    await pool.query("update users set email = $1, access_token = $2, refresh_token = coalesce($3, refresh_token), updated_at = now() where id = $4", [profile.data.email, tokens.access_token, tokens.refresh_token, userId]);
    await setSession(userId);
    return NextResponse.redirect(new URL("/", request.url));
  }
  const calendar = await (await import("@/lib/google")).createCalendarClient(tokens.access_token!, tokens.refresh_token!).calendars.get({ calendarId: "primary" });
  const user = await pool.query("insert into users (google_sub, email, access_token, refresh_token, timezone) values ($1, $2, $3, $4, $5) on conflict (google_sub) do update set email = excluded.email, access_token = excluded.access_token, refresh_token = coalesce(excluded.refresh_token, users.refresh_token), timezone = excluded.timezone, updated_at = now() returning id", [profile.data.id, profile.data.email, tokens.access_token, tokens.refresh_token, calendar.data.timeZone ?? "UTC"]);
  const userId = user.rows[0].id;
  await pool.query("insert into calendar_sync_state (user_id, calendar_id) values ($1, 'primary') on conflict (user_id) do update set calendar_id = excluded.calendar_id", [userId]);
  await setSession(userId); await syncCalendar(userId, true); await registerCalendarWatch(userId); await regenerateSummaries(userId);
  return NextResponse.redirect(new URL("/", request.url));
}