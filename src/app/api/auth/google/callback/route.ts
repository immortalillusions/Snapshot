import { NextResponse } from "next/server";
import { createOAuthClient } from "@/lib/google";
import { pool } from "@/lib/db";
import { setSession } from "@/lib/session";
import { registerCalendarWatch, syncCalendar } from "@/lib/sync";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 });
  const oauth = createOAuthClient(); const { tokens } = await oauth.getToken(code); oauth.setCredentials(tokens);
  const oauth2 = (await import("googleapis")).google.oauth2({ version: "v2", auth: oauth });
  const [profile, calendar] = await Promise.all([oauth2.userinfo.get(), (await import("@/lib/google")).createCalendarClient(tokens.access_token!, tokens.refresh_token!).calendars.get({ calendarId: "primary" })]);
  const user = await pool.query("insert into users (google_sub, email, access_token, refresh_token, timezone) values ($1, $2, $3, $4, $5) on conflict (google_sub) do update set email = excluded.email, access_token = excluded.access_token, refresh_token = coalesce(excluded.refresh_token, users.refresh_token), timezone = excluded.timezone, updated_at = now() returning id", [profile.data.id, profile.data.email, tokens.access_token, tokens.refresh_token, calendar.data.timeZone ?? "UTC"]);
  const userId = user.rows[0].id;
  await pool.query("insert into calendar_sync_state (user_id, calendar_id) values ($1, 'primary') on conflict (user_id) do update set calendar_id = excluded.calendar_id", [userId]);
  await setSession(userId); await syncCalendar(userId, true); await registerCalendarWatch(userId);
  return NextResponse.redirect(new URL("/", request.url));
}