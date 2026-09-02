import { google } from "googleapis";

export const calendarScopes = ["openid", "email", "https://www.googleapis.com/auth/calendar"];

function googleRedirectUri() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) throw new Error("GOOGLE_REDIRECT_URI is required for Google OAuth");
  return redirectUri;
}

export function createOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri());
}

export function createCalendarClient(accessToken: string, refreshToken: string) {
  const auth = createOAuthClient();
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth });
}

export function summaryMarker(userId: string, day: "today" | "tomorrow") {
  return `snapshot-summary:${userId}:${day}`;
}