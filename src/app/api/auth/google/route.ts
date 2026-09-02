import { NextResponse } from "next/server";
import { calendarScopes, createOAuthClient } from "@/lib/google";
export const dynamic = "force-dynamic";
export function GET() {
	const oauthClient = createOAuthClient();
	const authorizationUrl = oauthClient.generateAuthUrl({
		access_type: "offline",
		prompt: "consent",
		scope: calendarScopes,
	});
	return NextResponse.redirect(authorizationUrl);
}