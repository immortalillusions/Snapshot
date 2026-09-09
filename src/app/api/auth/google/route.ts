/** Starts Google OAuth with Calendar read/write access. */

import { NextResponse } from "next/server";
import { calendarScopes, createOAuthClient } from "@/lib/google";

export const dynamic = "force-dynamic";

/** Redirects the browser to Google's consent screen. */
export function GET() {
  const oauthClient = createOAuthClient();
  const authorizationUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: calendarScopes,
  });
  return NextResponse.redirect(authorizationUrl);
}