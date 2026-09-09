/** Reads and updates summary settings for the authenticated user. */

import { NextResponse } from "next/server";
import { withAuthenticatedUser } from "@/lib/api";
import { pool } from "@/lib/db";
import { regenerateSummaries } from "@/lib/summaries";

/** Returns the stored settings object. */
export const GET = withAuthenticatedUser(async (userId) => {
	const row = (
		await pool.query("select settings from users where id = $1", [userId])
	).rows[0];
	return NextResponse.json(row?.settings ?? {});
});

/** Merges settings and regenerates all affected summaries. */
export const PATCH = withAuthenticatedUser(
	async (userId, request: Request) => {
		const settings = await request.json();
		const result = await pool.query(
			"update users set settings = settings || $1::jsonb, updated_at = now() where id = $2 returning settings",
			[JSON.stringify(settings), userId],
		);
		await regenerateSummaries(userId);
		return NextResponse.json(result.rows[0]?.settings ?? settings);
	},
);
