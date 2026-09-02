Build a Google Calendar task-summary app inspired by https://github.com/immortalillusions/notlate.

## Goal

The app watches the user's Google Calendar and interprets specially formatted events as tasks for courses/categories. Every day, it maintains two Google Calendar summary events:

* Today
* Tomorrow

The summaries contain upcoming tasks grouped by course, plus completed tasks.

Use **Vercel** for hosting/serverless functions and **Postgres** for persistence.

## Google authentication and Calendar integration

Use Google OAuth.

Request the permissions needed to read and modify the user's primary Google Calendar, similar to NotLate.

Use the user's **primary calendar**; do not add a source-calendar setting to the UI.

Register a Google Calendar push notification/watch for the primary calendar.

Use **Google Calendar incremental sync tokens** rather than repeatedly downloading a fixed future range.

### Sync behavior

On initial connection:

1. Perform a full Calendar sync.
2. Process all relevant events.
3. Store Google's `nextSyncToken`.

When a Calendar change notification is received:

1. Use the stored sync token to perform an incremental sync.
2. Process only changed/deleted events.
3. Store the new sync token.
4. Regenerate today's and tomorrow's summary events.

Google Calendar delivers these watch notifications as HTTPS `POST` requests to the registered webhook URL; it does not call the webhook with `GET`.

NOTE: On page reload, the web UI reads the current tasks from Postgres; it does not itself update the db - eg reconcile Google Calendar. A Calendar edit that appears after a dashboard refresh was already applied to Postgres by the webhook or by the scheduled reconciliation Cron.

If Google returns `410 Gone` for the sync token:

1. Discard the old token.
2. Perform a full sync.
3. Store the new sync token.

Also have a periodic Vercel Cron reconciliation job that performs incremental sync using the stored sync token, so missed push notifications can be recovered.

Store the Google Calendar event ID as the task's external identifier.

## Task format

A Calendar event is treated as a task only when its title **strictly ends with**:

`[Course]`

Examples:

`Assignment 3 [CS 2214]`

→ task name: `Assignment 3`
→ course: `CS 2214`

`Assignment 3 [CS 2214] something`

→ not a task.

Course names are **case-insensitive**.

Whitespace around the task/course components should be normalized.

The task's due date/time is the Google Calendar event's **start date/time**.

If the course does not already exist, automatically create it.

There is also a web UI for manually creating/editing courses and tasks, but Calendar events are the primary input mechanism.

## Completion status

A task is completed when its Calendar event title starts with `!`.

Example:

`!Exam [CS 1100]`

means:

* task name = `Exam`
* course = `CS 1100`
* completed = true

The `!` is metadata and should not appear in the displayed task name.

Removing `!` marks the task incomplete again.

## Calendar event changes

Calendar events and tasks are linked by Google Calendar event ID.

Changes must update the existing task rather than create a duplicate.

Handle changes as follows:

* new matching event → create task
* edit task name → update task
* edit course → move task to new course
* edit date/time → update due date
* add `!` → mark completed
* remove `!` → mark incomplete
* remove `[Course]` from the title → delete/stop tracking that task
* delete Calendar event → delete the task

## Daily summary

Create/update exactly two summary events:

* today's summary
* tomorrow's summary

The summary should be placed in the Google Calendar event's **description**.

Use the configurable summary event start time and duration.

The summary-generation time determines when the summaries are generated, not which date they represent.

By default:

* generation time = 8:00 AM
* summary event time = 9:30–10:00 AM

At 8:00 AM, the daily Cron should ensure today's and tomorrow's summary events are correct.

The process must be idempotent: running the generation logic multiple times must update existing summary events instead of creating duplicates.

Use a stable identifier/marker so the app can reliably find its generated summary events.

## Which tasks appear in a summary

For each course/category independently:

1. Include **all tasks whose due date falls within the next N calendar days**, where N is configurable.
2. The date range is inclusive and based on calendar dates, not a rolling number of hours.

Example with N = 10 on September 2:

September 2 00:00 through September 11 23:59.

3. If fewer than M tasks from that course/category were selected, add the earliest upcoming unselected tasks from that same course/category until there are M.
4. Those additional tasks have **no maximum future cutoff**. They may be arbitrarily far in the future.
5. If the course/category has fewer than M total tasks, show all of them.
6. Tasks already selected by the date-window rule must not be duplicated by the fallback rule.
7. Tasks are ordered from earliest due date/time to latest.

Completed tasks participate in the exact same selection logic. Do not select extra tasks just for the completed section.

## Summary format

The description should use this structure:

Course 1:

* Task A of Course 1: Month Day Time
* Task B of Course 1: Month Day Time

Course 2:

* Task A of Course 2: Month Day Time

Misc:

* Task A of Misc: Month Day Time

Completed:

* Task A [Misc]: Month Day Time
* Task A [Course 2]: Month Day Time

Only include course/category sections that have selected incomplete tasks.

The **Completed** section should contain all selected completed tasks across all courses/categories, sorted by **most recent due date/time first**.

For completed tasks, display the course in brackets.

## Course ordering

The web UI must allow the user to configure the ordering of courses/categories in the summary.

The configured ordering determines the order of the course sections.

Support a `Misc` category.

## Web UI settings

Provide a web UI for:

* summary event start time
* summary event duration
* number of calendar days included in the lookahead window
* minimum number of tasks shown per course/category
* course/category ordering
* manual course creation/editing
* manual task creation/editing

Do **not** add a source-calendar selector; use the user's primary Google Calendar.

## Reactive summary updates

Whenever **any task changes**, including:

* name
* course
* due date/time
* completion status
* creation
* deletion

immediately regenerate:

* today's summary
* tomorrow's summary

The summary-generation logic must be implemented in one shared function so both the Cron and task-change path use the same rules.

For Calendar-originated task changes, the required order is: receive the webhook notification, incrementally reconcile the Calendar change into Postgres, then regenerate both summaries from the updated Postgres tasks.

## Data model

Persist at minimum:

### User

* user ID
* Google account/auth information
* timezone derived from Google Calendar

### Calendar sync state

* user ID
* primary calendar ID
* sync token
* watch/channel information and expiration as required

### Course/category

* user ID
* name
* ordering position

### Task

* user ID
* course/category
* task name
* due date/time
* completed status
* Google Calendar event ID

## Timezone

Use the timezone associated with the user's Google Calendar/account. Do not hardcode a timezone.

## Implementation priorities

Keep the implementation focused on the requirements above.

Use the existing NotLate repository as architectural inspiration for Google OAuth, Calendar watch/webhook handling, Vercel Cron, and Google Calendar integration, but do **not** copy its 7-day event-fetch limitation; this app must support tasks arbitrarily far into the future via incremental synchronization.
