-- Outlet Brain — Tell rebuild against Schema Living Doc v4.
--
-- v4's central correction: content type (log/incident/judgment_call/
-- task_request), not subject, drives where something goes. Subject just
-- rides along for tagging/filtering. Concretely:
--   1. observations + fyis collapse into one `logs` table — v4 no longer
--      distinguishes them at all.
--   2. `pattern` is dropped as a per-session classification outcome —
--      patterns are now produced by a separate async/periodic scan across
--      many sessions (v4 §6), never decided within one Tell. The enum
--      value is left in place (harmless, unused going forward) rather
--      than dropped, since dropping an enum value that's still referenced
--      by historical session_classifications rows isn't a clean operation.
--   3. `task` -> `task_request` (rename, same meaning, matches v4 naming).
--   4. `judgment_call` added as its own first-class content type.
--   5. A new `subject` taxonomy (12 categories, v4 §0) is added across
--      logs/incidents/judgment_calls/tasks, entity-resolved via 7 tables —
--      2 of which (inventory_stock, facility_premises) don't exist yet and
--      are created here with no seed data basis in the original 8 dummy
--      docs (flagged in SCHEMA_NOTES.md; a small hand-written seed list
--      goes into supabase/seed/seed.sql, not here — this file is schema +
--      data-migration only, consistent with every other migration).

-- ---------------------------------------------------------------------
-- 1. classification_type: rename + add the new content types
-- ---------------------------------------------------------------------

alter type classification_type rename value 'task' to 'task_request';
alter type classification_type add value 'log';
alter type classification_type add value 'judgment_call';
-- 'observation' and 'fyi' are left in the enum, now unused going forward,
-- for the same reason 'pattern' is above: historical rows still name them.

-- ---------------------------------------------------------------------
-- 2. Subject taxonomy (v4 §0 — "Standing entity/process reference")
-- ---------------------------------------------------------------------

create type subject_tag as enum (
  -- entity-subjects (a real, poolable thing with an id)
  'customer',
  'vendor',
  'staff_colleague',
  'equipment_machine',
  'recipe_menu',
  'inventory_stock',
  'facility_premises',
  -- process-subjects (a domain tag, no discrete "thing" to attach an id to)
  'process_sop',
  'finance_billing',
  'compliance_safety',
  'schedule_roster',
  'competitor_market'
);

-- ---------------------------------------------------------------------
-- 3. New entity-subject master tables (no doc/dummy-data basis — see
--    SCHEMA_NOTES.md; seed rows live in supabase/seed/seed.sql)
-- ---------------------------------------------------------------------

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index inventory_items_outlet_id_idx on public.inventory_items(outlet_id);

create table public.facility_areas (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index facility_areas_outlet_id_idx on public.facility_areas(outlet_id);

-- ---------------------------------------------------------------------
-- 4. logs — merge of observations + fyis
-- ---------------------------------------------------------------------

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  source_session_id uuid references public.sessions(id) on delete set null,
  subject subject_tag,
  entity_type text,
  entity_id uuid,
  summary text not null,
  -- Replaces observations.status (was always 'open', never read as
  -- anything else in this app) with the thing v4 actually describes for
  -- Home's updates feed: "Drag-to-archive is a manual, per-item action."
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index logs_outlet_id_idx on public.logs(outlet_id);
create index logs_entity_idx on public.logs(entity_type, entity_id);

-- Preserve ids across the merge — patterns.observation_ids (uuid[], no FK)
-- and any existing session_classifications.resulting_id pointers keep
-- resolving correctly without a data rewrite.
insert into public.logs (id, outlet_id, source_session_id, entity_type, entity_id, summary, archived, created_at)
select id, outlet_id, source_session_id, entity_type, entity_id, summary, false, created_at
from public.observations;

insert into public.logs (id, outlet_id, source_session_id, entity_type, entity_id, summary, archived, created_at)
select id, outlet_id, source_session_id, null, null, summary, false, created_at
from public.fyis;

-- tasks.source_observation_id pointed at observations — repoint at logs
-- (same ids, just migrated tables) rather than leaving a dangling FK.
alter table public.tasks rename column source_observation_id to source_log_id;
alter table public.tasks drop constraint tasks_source_observation_id_fkey;
alter table public.tasks
  add constraint tasks_source_log_id_fkey
  foreign key (source_log_id) references public.logs(id) on delete set null;

drop table public.fyis;
drop table public.observations;

-- ---------------------------------------------------------------------
-- 5. subject column — every session-derived record gets tagged, per v4's
--    "subject rides along... for filtering, search, and pattern-grouping"
-- ---------------------------------------------------------------------

alter table public.incidents add column subject subject_tag;
alter table public.judgment_calls add column subject subject_tag;
alter table public.tasks add column subject subject_tag;
