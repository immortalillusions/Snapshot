# Snapshot Project Instructions

Snapshot is a Google Calendar task manager built with Next.js, PostgreSQL, and the Google Calendar API. Preserve the calendar-first workflow and synchronization rules below when changing the project.

## Core Behavior

- Use the authenticated user's primary Google Calendar.
- Treat an event as a task only when its trimmed title ends with `[Course]`.
- Match course names case-insensitively and normalize surrounding whitespace.
- Use the event start as the task due date and time.
- Treat a leading `!` as completion metadata; do not include it in the displayed task name.
- Link synchronized tasks by Google Calendar event ID.
- Update an existing task when its source event changes.
- Stop tracking a task when its event is deleted or no longer has a valid course suffix.

Example titles:

```text
Assignment 3 [CS 2214]   -> incomplete CS 2214 task
!Exam [CS 1100]          -> completed CS 1100 task
Assignment [CS 2214] x   -> ignored because the suffix is not final
```

## Synchronization

On a new Google connection:

1. Exchange the OAuth code and store the account details.
2. Read the primary calendar timezone.
3. Create calendar synchronization state.
4. Perform a full event sync and store Google's `nextSyncToken`.
5. Register a Calendar push-notification channel.
6. Generate daily and weekly summaries.

For subsequent changes:

1. Validate the notification's channel token, channel ID, and resource ID.
2. Fetch changes using the stored sync token.
3. Apply changed and deleted events to PostgreSQL in a transaction.
4. Store the replacement sync token only after processing the page set.
5. Regenerate daily summaries and weekly summaries affected by old or new task dates.

If Google returns `410 Gone`, clear the expired token and perform a full sync. Always acknowledge webhook delivery; the scheduled reconciliation job is the fallback for processing failures or missed notifications.

The Vercel Cron endpoint runs daily at `08:00 UTC`. It is protected by `CRON_SECRET`, performs incremental reconciliation, renews Calendar watches that expire within 24 hours, and refreshes daily summaries.

The browser reads current state from PostgreSQL. Reloading the dashboard does not initiate Calendar reconciliation.

## Summary Rules

Snapshot maintains exactly one `Today` event and one `Tomorrow` event per user. Generated events use stable private markers so repeated runs update existing events.

For each course, daily summaries:

1. Select tasks within the configured calendar-date lookahead range.
2. If the selection is below the configured minimum, add the earliest remaining tasks from that course.
3. Keep tasks ordered by due date.
4. Show incomplete tasks under course headings.
5. Show selected completed tasks in one `Completed` section, newest due date first.

Course sections follow the saved course order. Summary descriptions escape user-provided task and course text before inserting Calendar-supported HTML.

Weekly summaries cover the inclusive nine-day period from Saturday through the following Sunday. They include only incomplete tasks, use the configured course order and duration, and have their own configurable start time. Automatic summaries extend from the current week through four months ahead; explicitly requested weeks remain stored until removed.

## Application Surface

The dashboard provides:

- Google OAuth connection status and disconnect controls
- Upcoming and completed task views
- Course and date filters
- Calendar-backed task creation, editing, completion, and deletion
- Summary time, duration, lookahead, and minimum-task settings
- Drag-and-drop course ordering
- Requested weekly-summary management

The API also exposes authenticated course list/create/update/delete routes. Courses are created automatically when synchronization encounters a new course name.

## Data Model

- `users`: Google identity, OAuth credentials, timezone, and summary settings
- `calendar_sync_state`: primary calendar, sync token, and watch-channel metadata
- `courses`: user-owned display and normalized names with ordering positions
- `tasks`: user, course, due time, completion state, and Google event ID
- `requested_weekly_summaries`: user-selected weekly summary dates

## Engineering Constraints

- Keep OAuth credentials, database access, and Google API calls server-side.
- Require an authenticated session for user-owned API routes.
- Keep SQL parameterized and scope reads and writes by user ID.
- Preserve the shared summary-generation path used by task changes, settings changes, webhooks, and Cron.
- Keep Calendar event upserts idempotent through private markers.
- Use calendar dates in the user's stored timezone; do not hardcode a user timezone.
- Keep route payloads and status codes stable unless an API change is intentional.
- Read the installed Next.js 16 documentation in `node_modules/next/dist/docs/` before changing framework APIs or conventions.

## Validation

Run the relevant checks after changes:

```bash
npm test
npm run lint
npm run build
```