-- Outlet Brain — Tasks feature enhancements (product feedback after the
-- first pass): deadlines, a place to record why a task couldn't be
-- completed, and an archived flag so finished/abandoned tasks can be
-- tucked away without deleting history.

alter table public.tasks add column due_date date;

-- Holds either "why I couldn't complete this" (paired with status =
-- 'blocked', see the companion enum migration) or general completion
-- comments/observations — one free-text field for both, matching the
-- resolution_note pattern already used on incidents.
alter table public.tasks add column resolution_note text;

alter table public.tasks add column archived boolean not null default false;

create index tasks_archived_idx on public.tasks(archived);
