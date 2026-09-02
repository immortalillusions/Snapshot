import { NextResponse } from "next/server";
import { calendarScopes, createOAuthClient } from "@/lib/google";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.redirect(createOAuthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: calendarScopes })); }