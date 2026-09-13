-- Task refinements, round 2:
--   - due_date becomes required (was optional)
--   - task proof gets its own vocabulary (text/photo/video/audio),
--     separated out from checklist_items' proof_type — those two are
--     diverging concepts now (tasks don't need 'reading' or a distinct
--     'confirm' value; clicking "mark done" already IS the confirmation)
--   - completed_at, needed so auto-archive can know how long a task's
--     been sitting in Done
--   - an admin-configurable auto-archive threshold

-- due_date required: backfill existing test rows (there's no real "right"
-- backfill value, so today's date is a reasonable placeholder for dev
-- data) before enforcing NOT NULL.
update public.tasks set due_date = current_date where due_date is null;
alter table public.tasks alter column due_date set not null;

-- A task-specific proof enum, separate from checklist_items' proof_type
-- (which keeps its original photo/reading/voice/confirm — untouched).
create type task_proof_type as enum ('text', 'photo', 'video', 'audio');

alter table public.tasks drop column if exists proof_type; -- was typed as the shared checklist proof_type enum
alter table public.tasks add column proof_type task_proof_type;

alter table public.tasks add column completed_at timestamptz;

-- Null = disabled (manual archive only, unchanged default). Set to a
-- number of days to auto-archive Done tasks older than that on read (see
-- app/tasks/data.ts) — this app has no scheduled-job infrastructure, so
-- it's swept lazily whenever the Tasks page loads, not on a real timer.
alter table public.outlets add column auto_archive_done_after_days int;
