/** Updates and deletes courses owned by the authenticated user. */

import { NextResponse } from "next/server";
import { withAuthenticatedUser } from "@/lib/api";
import { pool } from "@/lib/db";
import { regenerateSummaries } from "@/lib/summaries";

type CourseRouteContext = { params: Promise<{ id: string }> };

/** Updates a course and refreshes summaries that display its name or order. */
export const PATCH = withAuthenticatedUser(
  async (userId, request: Request, { params }: CourseRouteContext) => {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      position?: number;
    };
    const result = await pool.query(
      "update courses set name = coalesce($1, name), normalized_name = coalesce(lower(trim($1)), normalized_name), position = coalesce($2, position) where id = $3 and user_id = $4 returning id, name, position",
      [body.name?.trim() || null, body.position ?? null, id, userId],
    );
    if (!result.rowCount) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 },
      );
    }
    await regenerateSummaries(userId);
    return NextResponse.json(result.rows[0]);
  },
);

/** Deletes an unused course and refreshes summary sections. */
export const DELETE = withAuthenticatedUser(
  async (userId, _request: Request, { params }: CourseRouteContext) => {
    const { id } = await params;
    const result = await pool.query(
      "delete from courses where id = $1 and user_id = $2",
      [id, userId],
    );
    if (!result.rowCount) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 },
      );
    }
    await regenerateSummaries(userId);
    return new NextResponse(null, { status: 204 });
  },
);