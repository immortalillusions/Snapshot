import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentUserId } from "@/lib/session";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query("select u.email, u.avatar_url, exists (select 1 from calendar_sync_state where user_id = u.id) as connected from users u where u.id = $1", [userId]);
  return NextResponse.json({ connected: result.rows[0]?.connected === true, email: result.rows[0]?.email ?? null, avatarUrl: result.rows[0]?.avatar_url ?? null });
}