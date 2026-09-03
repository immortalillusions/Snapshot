import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { pool } from "@/lib/db";
import { weeklySummaryMarker } from "@/lib/google";
import { createCalendarClient } from "@/lib/google";
import { getSaturdayOfWeek } from "@/lib/domain";

export async function DELETE(_request: Request, { params }: { params: Promise<{ weekStart: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requested = (await params).weekStart;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested) || Number.isNaN(new Date(`${requested}T12:00:00Z`).getTime())) return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  const weekStart = getSaturdayOfWeek(requested);
  const result = await pool.query("select u.access_token, u.refresh_token, s.calendar_id from users u join calendar_sync_state s on s.user_id = u.id where u.id = $1", [userId]);
  const user = result.rows[0];
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const calendar = createCalendarClient(user.access_token, user.refresh_token);
  const marker = weeklySummaryMarker(userId, weekStart);
  const existing = await calendar.events.list({ calendarId: user.calendar_id, privateExtendedProperty: [`snapshotMarker=${marker}`], maxResults: 1 });
  const eventId = existing.data.items?.[0]?.id;
  if (eventId) await calendar.events.delete({ calendarId: user.calendar_id, eventId });
  await pool.query("delete from requested_weekly_summaries where user_id = $1 and week_start = $2", [userId, weekStart]);
  return new NextResponse(null, { status: 204 });
}