/** Removes a requested weekly summary and its generated Calendar event. */

import { NextResponse } from "next/server";
import { withAuthenticatedUser } from "@/lib/api";
import { pool } from "@/lib/db";
import { createCalendarClient, weeklySummaryMarker } from "@/lib/google";
import { normalizeWeekStart } from "@/lib/domain";

type WeeklySummaryRouteContext = {
  params: Promise<{ weekStart: string }>;
};

/** Deletes a requested week and its matching generated event. */
export const DELETE = withAuthenticatedUser(
  async (userId, _request: Request, { params }: WeeklySummaryRouteContext) => {
  const requested = (await params).weekStart;
    const weekStart = normalizeWeekStart(requested);
    if (!weekStart) {
      return NextResponse.json({ error: "Invalid week" }, { status: 400 });
    }
    const result = await pool.query(
      "select u.access_token, u.refresh_token, s.calendar_id from users u join calendar_sync_state s on s.user_id = u.id where u.id = $1",
      [userId],
    );
  const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  const calendar = createCalendarClient(user.access_token, user.refresh_token);
  const marker = weeklySummaryMarker(userId, weekStart);
    const existing = await calendar.events.list({
      calendarId: user.calendar_id,
      privateExtendedProperty: [`snapshotMarker=${marker}`],
      maxResults: 1,
    });
  const eventId = existing.data.items?.[0]?.id;
    if (eventId) {
      await calendar.events.delete({ calendarId: user.calendar_id, eventId });
    }
    await pool.query(
      "delete from requested_weekly_summaries where user_id = $1 and week_start = $2",
      [userId, weekStart],
    );
  return new NextResponse(null, { status: 204 });
  },
);