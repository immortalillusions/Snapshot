import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { pool } from "@/lib/db";
import { getDateInTimeZone, getSaturdayOfWeek } from "@/lib/domain";
import { regenerateSummaries } from "@/lib/summaries";

function normalizeWeekStart(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : getSaturdayOfWeek(value);
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query("select week_start from requested_weekly_summaries where user_id = $1 order by week_start", [userId]);
  return NextResponse.json(result.rows.map(row => row.week_start instanceof Date ? getDateInTimeZone(row.week_start, "UTC") : String(row.week_start).slice(0, 10)));
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const weekStart = normalizeWeekStart((await request.json() as { weekStart?: unknown }).weekStart);
  if (!weekStart) return NextResponse.json({ error: "weekStart must be a valid date" }, { status: 400 });
  await pool.query("insert into requested_weekly_summaries (user_id, week_start) values ($1, $2) on conflict (user_id, week_start) do nothing", [userId, weekStart]);
  await regenerateSummaries(userId, new Date(), { weeklyWeekStarts: [weekStart] });
  return NextResponse.json({ weekStart }, { status: 201 });
}