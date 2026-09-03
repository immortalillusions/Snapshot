import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { pool } from "@/lib/db";
import { regenerateSummaries } from "@/lib/summaries";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId(); if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const body = await request.json() as { name?: string; position?: number };
  const result = await pool.query("update courses set name = coalesce($1, name), normalized_name = coalesce(lower(trim($1)), normalized_name), position = coalesce($2, position) where id = $3 and user_id = $4 returning id, name, position", [body.name?.trim() || null, body.position ?? null, id, userId]);
  if (!result.rowCount) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  await regenerateSummaries(userId);
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId(); const { id } = await params; if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query("delete from courses where id = $1 and user_id = $2", [id, userId]);
  if (!result.rowCount) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  await regenerateSummaries(userId);
  return new NextResponse(null, { status: 204 });
}