-- Refines task proof to reuse the SAME proof_type vocabulary already
-- defined for checklist_items (photo/reading/voice/confirm) rather than
-- classifying an uploaded file's MIME type after the fact — the creator
-- now picks what kind of proof a task needs, same as a checklist item
-- would. Supersedes proof_media_type from the previous migration.
--
-- Also adds source lineage (source_pattern_id, source_incident_id) so
-- task priority can be derived from where a task came from, rather than
-- set manually.

alter table public.tasks add column proof_type proof_type; -- reuses the existing enum, no new type needed
alter table public.tasks add column proof_value text; -- for proof_type = 'reading' (a number/short value, same shape as checklist_completions.proof_value)

alter table public.tasks add column source_pattern_id uuid references public.patterns(id) on delete set null;

-- Not wired up by any UI yet — nothing in this app currently converts an
-- incident into a task. Added now because task priority is meant to rank
-- a safety-incident-sourced task highest, and that needs somewhere to
-- record the link once such a flow exists. Until then this column stays
-- null on every row and that priority tier simply never fires.
alter table public.tasks add column source_incident_id uuid references public.incidents(id) on delete set null;

alter table public.tasks drop column if exists proof_media_type;
