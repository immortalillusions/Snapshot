/** Lists and creates requested weekly summary subscriptions. */

import { NextResponse } from "next/server";
import { withAuthenticatedUser } from "@/lib/api";
import { pool } from "@/lib/db";
import { getDateInTimeZone, normalizeWeekStart } from "@/lib/domain";
import { regenerateSummaries } from "@/lib/summaries";

/** Returns the normalized dates of all explicitly requested weeks. */
export const GET = withAuthenticatedUser(async (userId) => {
  const result = await pool.query(
    "select week_start from requested_weekly_summaries where user_id = $1 order by week_start",
    [userId],
  );
  return NextResponse.json(
    result.rows.map((row) =>
      row.week_start instanceof Date
        ? getDateInTimeZone(row.week_start, "UTC")
        : String(row.week_start).slice(0, 10),
    ),
  );
});

/** Subscribes to a week and generates its summary immediately. */
export const POST = withAuthenticatedUser(
  async (userId, request: Request) => {
    const weekStart = normalizeWeekStart(
      ((await request.json()) as { weekStart?: unknown }).weekStart,
    );
    if (!weekStart) {
      return NextResponse.json(
        { error: "weekStart must be a valid date" },
        { status: 400 },
      );
    }
    await pool.query(
      "insert into requested_weekly_summaries (user_id, week_start) values ($1, $2) on conflict (user_id, week_start) do nothing",
      [userId, weekStart],
    );
    await regenerateSummaries(userId, new Date(), {
      weeklyWeekStarts: [weekStart],
    });
    return NextResponse.json({ weekStart }, { status: 201 });
  },
);