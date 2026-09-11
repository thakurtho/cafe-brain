-- Outlet Brain — extensions & enums
-- Every status/category value that the schema doc explicitly enumerates
-- (with a parenthetical like "(ask/tell)") becomes a real Postgres enum.
-- Fields where the doc just says "status" with no enumerated values are
-- left as `text` in later migrations rather than guessed into an enum.

create extension if not exists pgcrypto;

-- Permission tier used by RLS policies. Distinct from users.role, which
-- stays free text (e.g. "Captain / Senior Barista") matching org_positions.
-- Added per product decision: role text stays descriptive, access_tier
-- drives access control.
create type access_tier as enum (
  'floor_staff',
  'shift_manager',
  'outlet_manager',
  'gm_owner'
);

-- Shared approval lifecycle for base recipes, recipe variants, SOPs,
-- training modules, and patterns. "draft" covers a record before it's
-- ever been submitted for sign-off.
create type approval_status as enum (
  'draft',
  'pending',
  'approved',
  'rejected'
);

create type session_mode as enum ('ask', 'tell');

-- BIC = Brain-Initiated Conversation, UIC = User-Initiated Conversation.
create type session_initiator as enum ('BIC', 'UIC');

create type session_status as enum ('open', 'closed');

create type message_sender as enum ('user', 'assistant', 'system');

create type classification_type as enum (
  'observation',
  'fyi',
  'task',
  'pattern',
  'incident',
  'none'
);

create type task_status as enum (
  'pending_approval',
  'approved',
  'in_progress',
  'done',
  'rejected'
);

create type completion_mode as enum ('manual', 'auto');

create type incident_status as enum ('open', 'resolved');

create type incident_response_type as enum (
  'floor_handles',
  'manager_must_engage'
);

-- Not enumerated in the doc, but a controlled vocabulary is clearly implied
-- (is_safety + response_type + requires_immediate_call all gate on how bad
-- it is). Flagged as an assumption.
create type incident_severity as enum ('low', 'medium', 'high', 'critical');

create type wastage_status as enum ('pending_approval', 'approved', 'rejected');

create type pos_permission_mode as enum ('direct', 'requires_manager_approval');

create type knowledge_gap_escalation_level as enum (
  'outlet_manager',
  'domain_owner',
  'brand'
);

create type knowledge_gap_status as enum ('open', 'escalated', 'resolved');

create type checklist_category as enum ('opening', 'closing', 'general');

-- Not enumerated in the doc; inferred from the proof mechanisms described
-- throughout (photo proof, numeric readings, voice confirm) and shown in
-- all three mockups.
create type proof_type as enum ('photo', 'reading', 'voice', 'confirm');

-- Dummy compliance data uses "Upcoming" and "Cleared"; "overdue" added as
-- the obvious third state once a due_date has passed uncleared.
create type compliance_status as enum ('upcoming', 'overdue', 'cleared');
