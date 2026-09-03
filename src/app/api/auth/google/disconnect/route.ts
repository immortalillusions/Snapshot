import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { disconnectCalendar } from "@/lib/sync";

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await disconnectCalendar(userId);
  await pool.query("update users set access_token = '', refresh_token = '', updated_at = now() where id = $1", [userId]);
  return NextResponse.json({ connected: false });
}