/** Reports the authenticated user's Google Calendar connection state. */

import { NextResponse } from "next/server";
import { withAuthenticatedUser } from "@/lib/api";
import { pool } from "@/lib/db";

/** Returns profile details and whether Calendar sync is configured. */
export const GET = withAuthenticatedUser(async (userId) => {
  const result = await pool.query(
    "select u.email, u.avatar_url, exists (select 1 from calendar_sync_state where user_id = u.id) as connected from users u where u.id = $1",
    [userId],
  );
  return NextResponse.json({
    connected: result.rows[0]?.connected === true,
    email: result.rows[0]?.email ?? null,
    avatarUrl: result.rows[0]?.avatar_url ?? null,
  });
});