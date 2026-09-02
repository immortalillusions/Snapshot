# Snapshot

Snapshot turns specially formatted events in a user's primary Google Calendar into course tasks and maintains Today/Tomorrow summary events.

## Local setup

1. Create a Postgres database and run `db/schema.sql`.
2. Copy `.env.example` to `.env.local` and fill in `STORAGE_DATABASE_URL`, Google OAuth credentials, `SESSION_SECRET`, and `CRON_SECRET`.
3. In Google Cloud, enable Calendar API and add `GOOGLE_REDIRECT_URI` as an authorized redirect URI.
4. Run `npm install` and `npm run dev`.
5. Open `/api/auth/google` to connect a Google account.

## Server endpoints

- `GET /api/auth/google` starts OAuth using the primary Calendar scope.
- `POST /api/webhooks/google-calendar` receives Calendar push notifications and runs incremental sync.
- `GET /api/cron/reconcile` is protected by `CRON_SECRET` and reconciles stored sync tokens and regenerates both summaries daily at 08:00 UTC, as configured in `vercel.json`.
- `GET|POST /api/tasks` supports authenticated task reads and manual task creation through Google Calendar.

`vercel.json` configures the hourly reconciliation Cron. Deploy with the project root as the Vercel application directory and add the variables from `.env.example` in the Vercel dashboard.

## Calendar change flow

Google Calendar push notifications are HTTPS `POST` requests; Google does not use `GET` to probe the webhook. A notification only signals that something changed, so the webhook uses the saved Google sync token to fetch the changed events, updates Postgres, and then regenerates the Today and Tomorrow summary events.

```text
Google Calendar event changes
  -> POST /api/webhooks/google-calendar
  -> incremental Calendar reconciliation
  -> Postgres task update
  -> Today and Tomorrow summary updates
```

The dashboard does not receive a browser push from the server so we need to click reload to read the updated db

For webhook renewal: the code registers a watch immediately after Google OAuth connection. Afterward, Vercel invokes the cron at 08:00 UTC every day (0 8 * * *). That cron calls renewCalendarWatchIfNeeded() for every user.
A watch is re-registered only when its saved expiration is less than 24 hours away (or already expired). It stops the old channel where possible, creates a new one, and stores its returned expiration. So renewal is checked daily and normally happens on the first 08:00 UTC run within 24 hours of expiry—not at a fixed number of days.
