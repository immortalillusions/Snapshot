import { google } from "googleapis";

export const calendarScopes = ["openid", "email", "https://www.googleapis.com/auth/calendar"];

export function createOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

export function createCalendarClient(accessToken: string, refreshToken: string) {
  const auth = createOAuthClient();
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth });
}

export function summaryMarker(userId: string, day: "today" | "tomorrow") {
  return `snapshot-summary:${userId}:${day}`;
}