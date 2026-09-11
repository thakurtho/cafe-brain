-- Outlet Brain — compliance (section 8), connective tissue (section 12),
-- reporting (section 13)

-- reminder_date is computed from due_date - process_duration_days, not set
-- arbitrarily (explicit rule in the doc) — a generated column enforces that
-- at the database level rather than trusting app code to compute it right.
-- The "status can't clear without proof" rule is enforced by the CHECK
-- constraint below.
create table public.compliance_reminders (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  topic text not null,
  due_date date not null,
  process_duration_days int not null default 0,
  reminder_date date generated always as (due_date - process_duration_days) stored,
  proof_document_url text,
  status compliance_status not null default 'upcoming',
  cleared_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (status <> 'cleared' or proof_document_url is not null)
);

create index compliance_reminders_outlet_id_idx on public.compliance_reminders(outlet_id);
create index compliance_reminders_status_idx on public.compliance_reminders(status);

-- Single index table for "everything about X" — fully polymorphic on both
-- sides, so no FKs by design. Not exposed to anon/authenticated roles at
-- all (see RLS migration) — it's backend connective tissue, not something
-- a client app queries directly.
create table public.entity_links (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now()
);

create index entity_links_source_idx on public.entity_links(source_type, source_id);
create index entity_links_entity_idx on public.entity_links(entity_type, entity_id);

-- recipient_role reuses access_tier (a report routes to a permission tier,
-- e.g. "outlet_manager" or "gm_owner") rather than duplicating a parallel
-- role vocabulary.
create table public.report_definitions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  entity_type text not null,
  metric text not null,
  filter jsonb,
  group_by text,
  time_window text,
  recipient_role access_tier,
  created_at timestamptz not null default now()
);

create index report_definitions_outlet_id_idx on public.report_definitions(outlet_id);

create table public.report_instances (
  id uuid primary key default gen_random_uuid(),
  report_definition_id uuid not null references public.report_definitions(id) on delete cascade,
  period_start date,
  period_end date,
  data_body jsonb not null,
  insight_text text,
  actionable_text text,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index report_instances_definition_idx on public.report_instances(report_definition_id);
