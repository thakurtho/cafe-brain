-- Task delegation, compliance-as-task, and deadline-extension requests.

-- Links a task back to the compliance reminder it was delegated from, so
-- completing the task can clear the compliance item automatically, and so
-- priority can rank a compliance-sourced task appropriately.
alter table public.tasks add column source_compliance_id uuid references public.compliance_reminders(id) on delete set null;

-- Deadline-extension request: the assignee asks, a manager approves (which
-- moves due_date to the requested date) or denies (due_date unchanged).
-- Kept as explicit fields rather than overloading 'blocked' — asking for
-- more time isn't the same claim as "I can't do this at all".
alter table public.tasks add column extension_requested boolean not null default false;
alter table public.tasks add column requested_due_date date;
alter table public.tasks add column extension_reason text;
