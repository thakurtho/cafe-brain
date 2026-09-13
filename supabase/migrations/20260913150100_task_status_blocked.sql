-- Adds a "couldn't complete" outcome, distinct from 'rejected' (which
-- means the approval itself was denied, not that someone tried and
-- couldn't finish it). Kept in its own migration file: Postgres doesn't
-- allow a newly added enum value to be used in the same transaction that
-- adds it, so this needs to be its own commit before anything references
-- 'blocked'.

alter type task_status add value if not exists 'blocked';
