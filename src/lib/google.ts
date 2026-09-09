/** Google OAuth and Calendar client factories plus generated-event markers. */

import { google } from "googleapis";

export const calendarScopes = ["openid", "email", "https://www.googleapis.com/auth/calendar"];

/** Returns the configured OAuth callback URI. */
function googleRedirectUri() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) throw new Error("GOOGLE_REDIRECT_URI is required for Google OAuth");
  return redirectUri;
}

/** Creates a Google OAuth client from server credentials. */
export function createOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri());
}

/** Creates an authenticated Google Calendar client. */
export function createCalendarClient(accessToken: string, refreshToken: string) {
  const auth = createOAuthClient();
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth });
}

/** Builds the stable private marker for a daily summary event. */
export function summaryMarker(userId: string, day: "today" | "tomorrow") {
  return `snapshot-summary:${userId}:${day}`;
}

/** Builds the stable private marker for a weekly summary event. */
export function weeklySummaryMarker(userId: string, weekStart: string) {
  return `snapshot-summary:${userId}:weekly:${weekStart}`;
}