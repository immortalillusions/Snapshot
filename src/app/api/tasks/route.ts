import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { pool } from "@/lib/db";
import { createCalendarClient } from "@/lib/google";
import { regenerateSummaries } from "@/lib/summaries";
import { reconcileCalendar } from "@/lib/sync";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query("select t.id, t.name, t.due_at, t.completed, t.google_event_id, c.name as course from tasks t join courses c on c.id = t.course_id where t.user_id = $1 order by t.due_at", [userId]);
  return NextResponse.json(result.rows);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { name?: string; course?: string; dueAt?: string; completed?: boolean };
  if (!body.name?.trim() || !body.course?.trim() || !body.dueAt) return NextResponse.json({ error: "name, course, and dueAt are required" }, { status: 400 });
  const user = (await pool.query("select u.access_token, u.refresh_token, s.calendar_id from users u join calendar_sync_state s on s.user_id = u.id where u.id = $1", [userId])).rows[0];
  const title = `${body.completed ? "!" : ""}${body.name.trim()} [${body.course.trim()}]`;
  const event = await createCalendarClient(user.access_token, user.refresh_token).events.insert({ calendarId: user.calendar_id, requestBody: { summary: title, start: { dateTime: body.dueAt }, end: { dateTime: new Date(new Date(body.dueAt).getTime() + 30 * 60000).toISOString() } } });
  await reconcileCalendar(userId);
  await regenerateSummaries(userId);
  return NextResponse.json({ id: event.data.id }, { status: 201 });
}