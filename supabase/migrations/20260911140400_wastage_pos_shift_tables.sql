-- Outlet Brain — wastage & POS boundary (section 6), shift lifecycle (section 7)

create table public.wastage_entries (
  id uuid primary key default gen_random_uuid(),
  source_session_id uuid references public.sessions(id) on delete set null,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  item text not null,
  quantity numeric,
  reason text,
  photo_url text,
  status wastage_status not null default 'pending_approval',
  approved_by uuid references public.users(id) on delete set null,
  synced_to_pos_at timestamptz,
  reversed boolean not null default false,
  reversal_reason text,
  reversed_by uuid references public.users(id) on delete set null,
  reversed_at timestamptz,
  -- Self-referential: points to the new offsetting entry created by a
  -- reversal. The original row is never edited (section 11 rule).
  reversal_pos_entry_id uuid references public.wastage_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index wastage_entries_outlet_id_idx on public.wastage_entries(outlet_id);
create index wastage_entries_status_idx on public.wastage_entries(status);

create table public.pos_permissions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  action_type text not null,
  mode pos_permission_mode not null,
  created_at timestamptz not null default now(),
  unique (outlet_id, action_type)
);

create table public.pos_synced_tasks (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  pos_task_id text not null,
  description text not null,
  assigned_to uuid references public.users(id) on delete set null,
  synced_at timestamptz not null default now(),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (outlet_id, pos_task_id)
);

create index pos_synced_tasks_outlet_id_idx on public.pos_synced_tasks(outlet_id);

-- Not defined anywhere in the schema doc, but shift_openings and
-- shift_handovers both reference a scheduled_shift_id, and all three
-- mockups show a real shift calendar (per-user shift times, roles,
-- vacancies). Added per product decision. pos_shift_id / synced_at are
-- forward-looking columns for the planned PetPooja shift sync.
create table public.scheduled_shifts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null, -- null = vacant shift
  org_position_id uuid references public.org_positions(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'missed', 'cancelled')),
  pos_shift_id text,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index scheduled_shifts_outlet_id_idx on public.scheduled_shifts(outlet_id);
create index scheduled_shifts_user_id_idx on public.scheduled_shifts(user_id);
create index scheduled_shifts_date_idx on public.scheduled_shifts(outlet_id, shift_date);

create table public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  scheduled_shift_id uuid references public.scheduled_shifts(id) on delete set null,
  source_session_ids uuid[] not null default '{}',
  unresolved_incident_ids uuid[] not null default '{}',
  compiled_summary text,
  gaps_flagged boolean not null default false,
  signed_off_by uuid references public.users(id) on delete set null,
  signed_off_at timestamptz,
  created_at timestamptz not null default now()
);

create index shift_handovers_outlet_id_idx on public.shift_handovers(outlet_id);

create table public.shift_openings (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  scheduled_shift_id uuid references public.scheduled_shifts(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  incoming_handover_id uuid references public.shift_handovers(id) on delete set null,
  carried_items_reviewed boolean not null default false,
  discrepancy_flagged boolean not null default false,
  discrepancy_note text,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index shift_openings_outlet_id_idx on public.shift_openings(outlet_id);

-- outlet_id: denormalized (not in the doc) purely to make RLS a direct
-- column check instead of a join through two possible polymorphic parents.
create table public.checklist_completions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  checklist_item_id uuid not null references public.checklist_items(id) on delete cascade,
  shift_opening_id uuid references public.shift_openings(id) on delete cascade,
  shift_handover_id uuid references public.shift_handovers(id) on delete cascade,
  completed_by uuid references public.users(id) on delete set null,
  proof_media_url text,
  proof_value text,
  voice_session_id uuid references public.sessions(id) on delete set null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  check (num_nonnulls(shift_opening_id, shift_handover_id) = 1)
);

create index checklist_completions_outlet_id_idx on public.checklist_completions(outlet_id);
create index checklist_completions_item_idx on public.checklist_completions(checklist_item_id);
