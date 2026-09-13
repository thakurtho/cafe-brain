-- Manager review of a completed task's proof, before it counts as truly
-- Done. Only meaningful for tasks that require proof — a task with
-- nothing to verify goes straight to Done as before (confirmed as the
-- right scoping: requires_proof is already tracked per-task, not
-- globally, so this reuses that same flag rather than adding a new one).

create type task_completion_status as enum ('pending_review', 'accepted', 'rejected');

alter table public.tasks add column completion_status task_completion_status;
alter table public.tasks add column completion_reviewed_by uuid references public.users(id) on delete set null;
alter table public.tasks add column completion_reviewed_at timestamptz;
alter table public.tasks add column rejection_reason text;

-- On rejection, the rejected attempt (proof, notes, timestamp) is frozen
-- in place — archived, status set to the existing (previously unused)
-- 'rejected' task_status value — rather than erased, and a NEW task row
-- picks up the reopened work, linked back via this column. Chains if it
-- cycles more than once: each new row points at the row it was reopened
-- from, not necessarily the original.
alter table public.tasks add column reopened_from_completion_id uuid references public.tasks(id) on delete set null;
