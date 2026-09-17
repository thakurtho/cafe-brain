-- Outlet Brain — v4 §0's second flag: "is_safety and is_cash_related are
-- boolean flags checkable on any content type, most commonly incident."
-- is_safety already exists (incidents-only, since a safety-relevant log
-- always escalates to incident per the doc's own collapse rule — see
-- SCHEMA_NOTES.md). is_cash_related is different: the doc's own example
-- is "a cash-related log (routine till count, no discrepancy) stays a
-- plain log" — so unlike is_safety, this one genuinely needs to live on
-- logs too, not just incidents.

alter table public.logs add column is_cash_related boolean not null default false;
alter table public.incidents add column is_cash_related boolean not null default false;
