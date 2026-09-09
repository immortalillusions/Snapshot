/** Lists and creates courses for the authenticated user. */

import { NextResponse } from "next/server";
import { withAuthenticatedUser } from "@/lib/api";
import { pool } from "@/lib/db";

/** Returns the user's courses in configured order. */
export const GET = withAuthenticatedUser(async (userId) => {
	const result = await pool.query(
		"select id, name, position from courses where user_id = $1 order by position, name",
		[userId],
	);
	return NextResponse.json(result.rows);
});

/** Creates a course or updates the display name of its existing match. */
export const POST = withAuthenticatedUser(
	async (userId, request: Request) => {
		const { name } = (await request.json()) as { name?: string };
		if (!name?.trim()) {
			return NextResponse.json(
				{ error: "name is required" },
				{ status: 400 },
			);
		}
		const result = await pool.query(
			"insert into courses (user_id, name, normalized_name, position) values ($1, $2, lower(trim($2)), coalesce((select max(position) + 1 from courses where user_id = $1), 0)) on conflict (user_id, normalized_name) do update set name = excluded.name returning id, name, position",
			[userId, name.trim()],
		);
		return NextResponse.json(result.rows[0], { status: 201 });
	},
);