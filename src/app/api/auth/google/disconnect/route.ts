/** Disconnects Google Calendar while preserving remote Calendar events. */

import { NextResponse } from "next/server";
import { withAuthenticatedUser } from "@/lib/api";
import { pool } from "@/lib/db";
import { disconnectCalendar } from "@/lib/sync";

/** Stops the watch and clears locally stored OAuth credentials. */
export const DELETE = withAuthenticatedUser(async (userId) => {
  await disconnectCalendar(userId);
  await pool.query(
    "update users set access_token = '', refresh_token = '', updated_at = now() where id = $1",
    [userId],
  );
  return NextResponse.json({ connected: false });
});