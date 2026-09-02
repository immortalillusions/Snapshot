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