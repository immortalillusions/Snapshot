import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentUserId } from "@/lib/session";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query("select exists (select 1 from calendar_sync_state where user_id = $1) as connected", [userId]);
  return NextResponse.json({ connected: result.rows[0]?.connected === true });
}