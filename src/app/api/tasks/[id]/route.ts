import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { pool } from "@/lib/db";
import { createCalendarClient } from "@/lib/google";
import { reconcileCalendar } from "@/lib/sync";
import { regenerateSummaries } from "@/lib/summaries";

async function context(id: string) {
  const userId = await currentUserId();
  if (!userId) return null;
  const result = await pool.query("select t.*, c.name as course_name, u.access_token, u.refresh_token, s.calendar_id from tasks t join courses c on c.id = t.course_id join users u on u.id = t.user_id join calendar_sync_state s on s.user_id = u.id where t.id = $1 and t.user_id = $2", [id, userId]);
  return result.rows[0] ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const row = await context((await params).id);
  if (!row) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const body = await request.json() as { name?: string; course?: string; dueAt?: string; completed?: boolean };
  const name = body.name?.trim() || row.name; const course = body.course?.trim() || row.course_name;
  const courseRow = body.course ? await pool.query("insert into courses (user_id, name, normalized_name) values ($1, $2, lower(trim($2))) on conflict (user_id, normalized_name) do update set name = excluded.name returning id", [row.user_id, course]) : { rows: [{ id: row.course_id }] };
  const title = `${body.completed ?? row.completed ? "!" : ""}${name} [${course}]`;
  await createCalendarClient(row.access_token, row.refresh_token).events.update({ calendarId: row.calendar_id, eventId: row.google_event_id, requestBody: { summary: title, start: { dateTime: body.dueAt ?? new Date(row.due_at).toISOString() }, end: { dateTime: new Date(new Date(body.dueAt ?? row.due_at).getTime() + 30 * 60000).toISOString() } } });
  await reconcileCalendar(row.user_id); await regenerateSummaries(row.user_id);
  return NextResponse.json({ ok: true, courseId: courseRow.rows[0].id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const row = await context((await params).id);
  if (!row) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  await createCalendarClient(row.access_token, row.refresh_token).events.delete({ calendarId: row.calendar_id, eventId: row.google_event_id });
  await pool.query("delete from tasks where id = $1", [row.id]); await regenerateSummaries(row.user_id);
  return new NextResponse(null, { status: 204 });
}