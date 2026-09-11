-- Outlet Brain — capture layer (section 4) & derived records (section 5)

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  initiated_by session_initiator not null,
  mode session_mode not null,
  status session_status not null default 'open',
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now()
);

create index sessions_outlet_id_idx on public.sessions(outlet_id);
create index sessions_user_id_idx on public.sessions(user_id);

-- Backfill the FK from recipe_variants (created before sessions existed).
alter table public.recipe_variants
  add constraint recipe_variants_source_session_id_fkey
  foreign key (source_session_id) references public.sessions(id) on delete set null;

create index recipe_variants_source_session_id_idx on public.recipe_variants(source_session_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  sender message_sender not null,
  text text,
  media_url text,
  created_at timestamptz not null default now()
);

create index messages_session_id_idx on public.messages(session_id);

create table public.session_classifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  classified_as classification_type not null,
  -- Polymorphic pointer to whichever table the classification produced
  -- (observations/fyis/tasks/patterns/incidents). No FK — target table
  -- varies with classified_as.
  resulting_id uuid,
  confidence numeric(5, 4) check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index session_classifications_session_id_idx on public.session_classifications(session_id);

-- outlet_id: not in the doc's field list for observations, but every
-- sibling table in this section (fyis, patterns, tasks, knowledge_gaps)
-- has it, and it's needed for RLS. Added.
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  source_session_id uuid references public.sessions(id) on delete set null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index observations_outlet_id_idx on public.observations(outlet_id);
create index observations_entity_idx on public.observations(entity_type, entity_id);

create table public.fyis (
  id uuid primary key default gen_random_uuid(),
  source_session_id uuid references public.sessions(id) on delete set null,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  summary text not null,
  created_at timestamptz not null default now()
);

create index fyis_outlet_id_idx on public.fyis(outlet_id);

create table public.patterns (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  observation_ids uuid[] not null default '{}',
  summary text not null,
  proposed_action text,
  status approval_status not null default 'pending',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  -- Set true once approved — makes it a candidate for cross-outlet
  -- comparison at the Brand/GM layer.
  brand_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create index patterns_outlet_id_idx on public.patterns(outlet_id);
create index patterns_entity_idx on public.patterns(entity_type, entity_id);
create index patterns_brand_visible_idx on public.patterns(brand_visible) where brand_visible;

-- source_insight_id: "insight" isn't a first-class table anywhere in the
-- schema doc — insight_text/actionable_text live on report_instances, and
-- the mockups' "Create task" buttons sit on insight cards driven by report
-- data. Treated as a soft reference to report_instances.id, left
-- unconstrained (no FK) since report_instances isn't guaranteed to remain
-- the only source of an "insight" long-term.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  source_session_id uuid references public.sessions(id) on delete set null,
  source_observation_id uuid references public.observations(id) on delete set null,
  source_insight_id uuid,
  description text not null,
  status task_status not null default 'pending_approval',
  assigned_to uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  self_assigned boolean not null default false,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  handover_reason text,
  handover_session_id uuid references public.sessions(id) on delete set null,
  requires_proof boolean not null default false,
  completion_mode completion_mode not null default 'manual',
  -- Polymorphic pointer used by completion_mode = 'auto' tasks to know
  -- which real-world record to watch (e.g. a training_progress row).
  auto_close_entity_type text,
  auto_close_entity_id uuid,
  created_at timestamptz not null default now()
);

create index tasks_outlet_id_idx on public.tasks(outlet_id);
create index tasks_assigned_to_idx on public.tasks(assigned_to);
create index tasks_status_idx on public.tasks(status);

-- outlet_id: not in the doc's field list for incidents, added for the same
-- reason as observations above.
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  source_session_id uuid references public.sessions(id) on delete set null,
  entity_type text,
  entity_id uuid,
  is_safety boolean not null default false,
  severity incident_severity,
  description text not null,
  status incident_status not null default 'open',
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_voice_session_id uuid references public.sessions(id) on delete set null,
  resolution_note text,
  handover_reason text,
  handover_session_id uuid references public.sessions(id) on delete set null,
  response_type incident_response_type not null,
  requires_immediate_call boolean not null default false,
  created_at timestamptz not null default now()
);

create index incidents_outlet_id_idx on public.incidents(outlet_id);
create index incidents_status_idx on public.incidents(status);

-- outlet_id: not in the doc's field list for judgment_calls, added for the
-- same reason as observations/incidents above.
create table public.judgment_calls (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  situation text not null,
  action_taken text,
  interview_session_id uuid references public.sessions(id) on delete set null,
  interview_qa jsonb,
  promoted_to_pattern_id uuid references public.patterns(id) on delete set null,
  flagged_to_manager boolean not null default false,
  manager_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index judgment_calls_outlet_id_idx on public.judgment_calls(outlet_id);
create index judgment_calls_session_id_idx on public.judgment_calls(session_id);

create table public.knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  source_session_id uuid references public.sessions(id) on delete set null,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  question_text text not null,
  entity_type text,
  entity_id uuid,
  occurrence_count int not null default 1,
  escalation_level knowledge_gap_escalation_level not null default 'outlet_manager',
  escalated_to uuid references public.users(id) on delete set null,
  status knowledge_gap_status not null default 'open',
  resolution_text text,
  -- Polymorphic pointer to whichever SOP/recipe/training record the
  -- resolution got written back into. promoted_to_type added alongside
  -- (not in the doc) for the same reason entity_type/entity_id pairs exist
  -- elsewhere — a bare uuid alone doesn't say which table it points to.
  promoted_to_type text,
  promoted_to_id uuid,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index knowledge_gaps_outlet_id_idx on public.knowledge_gaps(outlet_id);
create index knowledge_gaps_status_idx on public.knowledge_gaps(status);
