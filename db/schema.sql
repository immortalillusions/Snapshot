create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  timezone text not null default 'UTC',
  settings jsonb not null default '{"generationTime":"08:00","summaryStartTime":"09:30","summaryDurationMinutes":30,"lookaheadDays":10,"minimumPerCourse":2,"courseOrder":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists calendar_sync_state (
  user_id uuid primary key references users(id) on delete cascade,
  calendar_id text not null,
  sync_token text,
  channel_id text,
  channel_resource_id text,
  channel_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  position integer not null default 0,
  unique (user_id, normalized_name)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  name text not null,
  due_at timestamptz not null,
  completed boolean not null default false,
  google_event_id text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, google_event_id)
);

create index if not exists tasks_due_at_idx on tasks(user_id, due_at);