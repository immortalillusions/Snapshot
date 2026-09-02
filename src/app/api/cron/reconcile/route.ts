import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { reconcileCalendar } from "@/lib/sync";
import { regenerateSummaries } from "@/lib/summaries";
export async function GET(request: Request) { if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const users = await pool.query("select id from users"); for (const user of users.rows) { await reconcileCalendar(user.id); await regenerateSummaries(user.id); } return NextResponse.json({ users: users.rowCount, generated: users.rowCount }); }