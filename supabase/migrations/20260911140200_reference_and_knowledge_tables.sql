-- Outlet Brain — reference entities (section 2) & approved knowledge (section 3)

-- price: not in the doc's field list for menu_items, but required to seed
-- the Musafir Cafe menu (every item has an INR price). Added.
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  category text not null,
  price numeric(10, 2),
  created_at timestamptz not null default now()
);

create index menu_items_outlet_id_idx on public.menu_items(outlet_id);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  type text,
  installed_on date,
  created_at timestamptz not null default now()
);

create index machines_outlet_id_idx on public.machines(outlet_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  phone text,
  preferences text,
  created_at timestamptz not null default now()
);

create index customers_outlet_id_idx on public.customers(outlet_id);

-- category: not in the doc's field list for vendors, but the dummy data has
-- a Category column per vendor (Coffee, Equipment, Dairy, ...). Added.
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  category text,
  supplies text,
  created_at timestamptz not null default now()
);

create index vendors_outlet_id_idx on public.vendors(outlet_id);

-- Base recipes. "No direct writes to approved knowledge, ever" (section 11)
-- is an app-layer rule (all writes go through recipe_variants / a suggestion
-- flow) — nothing in the base recipes table itself prevents an UPDATE, since
-- that policy is about product flow, not something a CHECK constraint can
-- express. ingredients is structured (name/quantity pairs); steps is free
-- text matching how the dummy recipes are written.
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  ingredients jsonb,
  steps text,
  owner_id uuid references public.users(id) on delete set null,
  version int not null default 1,
  status approval_status not null default 'draft',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index recipes_outlet_id_idx on public.recipes(outlet_id);
create index recipes_menu_item_id_idx on public.recipes(menu_item_id);

create table public.recipe_variants (
  id uuid primary key default gen_random_uuid(),
  base_recipe_id uuid not null references public.recipes(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  description text not null,
  submitted_by uuid references public.users(id) on delete set null,
  source_session_id uuid, -- FK added in the capture-tables migration (sessions is defined after this file)
  status approval_status not null default 'pending',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  is_standing_option boolean not null default false,
  created_at timestamptz not null default now()
);

create index recipe_variants_outlet_id_idx on public.recipe_variants(outlet_id);
create index recipe_variants_base_recipe_id_idx on public.recipe_variants(base_recipe_id);

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  topic text not null,
  linked_machine_id uuid references public.machines(id) on delete set null,
  content text,
  owner_id uuid references public.users(id) on delete set null,
  pending_edit_content text,
  edit_source text,
  version int not null default 1,
  status approval_status not null default 'approved',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index sops_outlet_id_idx on public.sops(outlet_id);

create table public.training_modules (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  title text not null,
  content text,
  linked_menu_item_id uuid references public.menu_items(id) on delete set null,
  linked_machine_id uuid references public.machines(id) on delete set null,
  owner_id uuid references public.users(id) on delete set null,
  pending_edit_content text,
  edit_source text,
  version int not null default 1,
  status approval_status not null default 'approved',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index training_modules_outlet_id_idx on public.training_modules(outlet_id);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  title text not null,
  linked_sop_id uuid references public.sops(id) on delete set null,
  proof_type proof_type not null,
  required boolean not null default true,
  category checklist_category not null,
  created_at timestamptz not null default now()
);

create index checklist_items_outlet_id_idx on public.checklist_items(outlet_id);

-- Not in the schema doc at all, but the dummy data (06_Training_Modules.md)
-- includes a per-staff, per-module completion matrix ("Done" / "In
-- progress" / "Not started"), and the manager mockup has tasks that
-- "auto-close when their training status shows done" — both need a table
-- like this to exist. Added. outlet_id is denormalized (same as the user's
-- outlet) purely so RLS can scope on it directly.
create table public.training_progress (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  training_module_id uuid not null references public.training_modules(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, training_module_id)
);

create index training_progress_outlet_id_idx on public.training_progress(outlet_id);
create index training_progress_user_id_idx on public.training_progress(user_id);
