import { NextResponse } from "next/server";
import { reconcileCalendar } from "@/lib/sync";
import { regenerateSummaries } from "@/lib/summaries";
import { pool } from "@/lib/db";
export function GET() { return NextResponse.json({ ok: true, service: "google-calendar-webhook" }); }
export async function POST(request: Request) {
	const userId = request.headers.get("x-goog-channel-token");
	const channelId = request.headers.get("x-goog-channel-id");
	const resourceId = request.headers.get("x-goog-resource-id");
	const resourceState = request.headers.get("x-goog-resource-state");
	console.info("Google Calendar webhook received", { userId, channelId, resourceId, resourceState });
	if (!userId || !channelId || !resourceId) return new NextResponse(null, { status: 204 });
	const result = await pool.query("select 1 from calendar_sync_state where user_id = $1 and channel_id = $2 and channel_resource_id = $3", [userId, channelId, resourceId]);
	if (!result.rowCount) return new NextResponse(null, { status: 204 });
	try {
		await reconcileCalendar(userId);
		console.info("Google Calendar webhook reconciliation complete", { userId });
		await regenerateSummaries(userId);
		console.info("Google Calendar webhook summary regeneration complete", { userId });
	} catch (error: unknown) {
		const failure = error as { code?: string | number; message?: string; response?: { status?: number; data?: unknown } };
		console.error("Google Calendar webhook processing failed", {
			userId,
			code: failure.code,
			status: failure.response?.status,
			message: failure.message ?? "Unknown error",
			response: failure.response?.data,
		});
		// Acknowledge the notification; the daily reconciliation Cron will recover it.
	}
	return new NextResponse(null, { status: 204 });
}