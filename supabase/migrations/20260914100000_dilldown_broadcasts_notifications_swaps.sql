-- Drill-down conversations, broadcasts, and shift swap requests.
-- (Notifications aren't a table — they're computed live from tasks,
-- patterns, compliance_reminders, etc. in app/notifications/data.ts. No
-- schema needed for that part.)

-- ---------------------------------------------------------------------
-- Drill-down: reuses the EXISTING sessions/messages capture layer and the
-- EXISTING entity_links table exactly as designed ("single index for
-- everything about X") — no new tables needed. A drill-down conversation
-- is just a session that stays 'open' instead of being closed after one
-- exchange (unlike Tell, which always closes immediately), linked to
-- whatever it's about via entity_links (source_type='session',
-- entity_type='pattern'|'task', entity_id=<that row's id>).
-- Nothing to migrate here — flagged for completeness.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Broadcasts
-- ---------------------------------------------------------------------

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  message text not null,
  -- null = everyone; otherwise restricted to one access_tier. Targeting by
  -- access_tier rather than the free-text role_title since it's the one
  -- structured, reliable grouping already used for permission checks
  -- elsewhere in this app.
  target_access_tier access_tier,
  important boolean not null default false,
  created_at timestamptz not null default now()
);

create index broadcasts_outlet_id_idx on public.broadcasts(outlet_id);

-- Only meaningful for important broadcasts, but not restricted at the
-- schema level to those — acknowledging an FYI broadcast is harmless if
-- someone does it anyway, just not surfaced as something to chase.
create table public.broadcast_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (broadcast_id, user_id)
);

-- ---------------------------------------------------------------------
-- Shift swap requests
-- ---------------------------------------------------------------------

create type shift_swap_status as enum ('pending', 'approved', 'rejected');

create table public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete cascade,
  -- Optional link to a real scheduled shift, once shift-scheduling UI
  -- exists in this app (scheduled_shifts is currently an unused table —
  -- see SCHEMA_NOTES.md). Until then shift_date/start_time/end_time below
  -- are captured directly on the request itself, denormalized, so this
  -- feature doesn't have to wait on a scheduling UI that doesn't exist yet.
  scheduled_shift_id uuid references public.scheduled_shifts(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  reason text not null,
  -- The person who's volunteered to cover, if any — independent of
  -- status. A request can be 'pending' with or without a volunteer; a
  -- manager can approve either way (e.g. "don't worry about it" with no
  -- volunteer at all).
  volunteer_id uuid references public.users(id) on delete set null,
  status shift_swap_status not null default 'pending',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index shift_swap_requests_outlet_id_idx on public.shift_swap_requests(outlet_id);
create index shift_swap_requests_status_idx on public.shift_swap_requests(status);
