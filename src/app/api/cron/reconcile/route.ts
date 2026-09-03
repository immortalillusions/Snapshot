import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { reconcileCalendar, renewCalendarWatchIfNeeded } from "@/lib/sync";
import { regenerateSummaries } from "@/lib/summaries";
export async function GET(request: Request) { if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const users = await pool.query("select u.id from users u join calendar_sync_state s on s.user_id = u.id"); for (const user of users.rows) { await reconcileCalendar(user.id); await renewCalendarWatchIfNeeded(user.id); await regenerateSummaries(user.id, new Date(), { weeklyWeekStarts: [] }); } return NextResponse.json({ users: users.rowCount, generated: users.rowCount }); }