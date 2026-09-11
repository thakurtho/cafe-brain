-- Outlet Brain — RLS helpers & policies
--
-- Baseline enforced here: a row is visible/writable if it belongs to the
-- current user's own outlet, OR the current user is access_tier =
-- 'gm_owner' and the row's outlet belongs to their brand_id. That's the
-- boundary explicitly asked for ("GM can see cross outlet at a brand
-- level... but [outlet staff] should only be able to access their outlet
-- data").
--
-- What this does NOT yet do: fine-grained action gating (e.g. "only the
-- Head Chef can approve a recipe", "only Outlet Manager+ can approve
-- wastage"). Section 11's approval rules are product/app-layer rules about
-- *who gets shown an approve button and what happens when they use it*,
-- not about outlet-boundary data isolation — enforcing every one of those
-- as its own RLS policy before any UI exists would mean guessing at
-- exact role cutoffs that aren't fully pinned down yet. That's a
-- deliberate follow-up once the approval flows are being built, not an
-- oversight here.

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read public.users
-- without recursing into the RLS policy that itself calls them — this is
-- the standard Supabase pattern for this exact problem. Migrations run as
-- a role with BYPASSRLS, so these functions bypass RLS on public.users
-- when they execute.)
-- ---------------------------------------------------------------------

create or replace function public.current_user_outlet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select outlet_id from public.users where id = auth.uid();
$$;

create or replace function public.current_user_brand_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select brand_id from public.users where id = auth.uid();
$$;

create or replace function public.current_user_access_tier()
returns access_tier
language sql
stable
security definer
set search_path = public
as $$
  select access_tier from public.users where id = auth.uid();
$$;

create or replace function public.is_gm_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_access_tier() = 'gm_owner', false);
$$;

-- The one predicate every policy below is built from: can the current
-- user see/touch a row belonging to target_outlet_id?
create or replace function public.user_can_access_outlet(target_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_outlet_id is not null and (
    target_outlet_id = public.current_user_outlet_id()
    or (
      public.is_gm_owner()
      and exists (
        select 1 from public.outlets o
        where o.id = target_outlet_id
          and o.brand_id = public.current_user_brand_id()
      )
    )
  );
$$;

-- ---------------------------------------------------------------------
-- brands, outlets, users — special-cased (no plain outlet_id column, or
-- the column itself is the outlet's own id)
-- ---------------------------------------------------------------------

alter table public.brands enable row level security;

create policy "brands_own_brand" on public.brands
  for all
  using (id = public.current_user_brand_id())
  with check (id = public.current_user_brand_id());

alter table public.outlets enable row level security;

create policy "outlets_accessible" on public.outlets
  for all
  using (public.user_can_access_outlet(id))
  with check (public.user_can_access_outlet(id));

alter table public.users enable row level security;

create policy "users_accessible" on public.users
  for all
  using (
    id = auth.uid()
    or public.user_can_access_outlet(outlet_id)
    or (public.is_gm_owner() and brand_id = public.current_user_brand_id())
  )
  with check (
    id = auth.uid()
    or public.user_can_access_outlet(outlet_id)
    or (public.is_gm_owner() and brand_id = public.current_user_brand_id())
  );

-- ---------------------------------------------------------------------
-- Generic outlet-scoped tables — every table below has a NOT NULL
-- outlet_id column, so one policy shape covers all of them.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  outlet_scoped_tables text[] := array[
    'org_positions', 'menu_items', 'machines', 'customers', 'vendors',
    'recipes', 'recipe_variants', 'sops', 'training_modules',
    'checklist_items', 'training_progress',
    'sessions', 'observations', 'fyis', 'patterns', 'tasks', 'incidents',
    'judgment_calls', 'knowledge_gaps',
    'wastage_entries', 'pos_permissions', 'pos_synced_tasks',
    'scheduled_shifts', 'shift_handovers', 'shift_openings',
    'checklist_completions',
    'compliance_reminders', 'report_definitions'
  ];
begin
  foreach t in array outlet_scoped_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      $f$create policy "%1$s_outlet_access" on public.%1$s
        for all
        using (public.user_can_access_outlet(outlet_id))
        with check (public.user_can_access_outlet(outlet_id))$f$,
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Tables without their own outlet_id — scoped via a join to their parent
-- ---------------------------------------------------------------------

alter table public.messages enable row level security;

create policy "messages_via_session" on public.messages
  for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = messages.session_id
        and public.user_can_access_outlet(s.outlet_id)
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = messages.session_id
        and public.user_can_access_outlet(s.outlet_id)
    )
  );

alter table public.session_classifications enable row level security;

create policy "session_classifications_via_session" on public.session_classifications
  for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_classifications.session_id
        and public.user_can_access_outlet(s.outlet_id)
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_classifications.session_id
        and public.user_can_access_outlet(s.outlet_id)
    )
  );

alter table public.report_instances enable row level security;

create policy "report_instances_via_definition" on public.report_instances
  for all
  using (
    exists (
      select 1 from public.report_definitions rd
      where rd.id = report_instances.report_definition_id
        and public.user_can_access_outlet(rd.outlet_id)
    )
  )
  with check (
    exists (
      select 1 from public.report_definitions rd
      where rd.id = report_instances.report_definition_id
        and public.user_can_access_outlet(rd.outlet_id)
    )
  );

-- ---------------------------------------------------------------------
-- entity_links — backend connective tissue, fully polymorphic on both
-- sides. RLS enabled with NO policies for anon/authenticated: only the
-- service role (which bypasses RLS) can touch it.
-- ---------------------------------------------------------------------

alter table public.entity_links enable row level security;
