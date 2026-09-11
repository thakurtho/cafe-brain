-- Outlet Brain — identity & org structure (schema doc section 1)

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  location text,
  created_at timestamptz not null default now()
);

create index outlets_brand_id_idx on public.outlets(brand_id);

-- users.id === auth.users.id (1:1). Auth strategy: Supabase Auth, phone OTP.
--
-- brand_id is required on every user (per product decision). outlet_id is
-- nullable: null means a brand-level user (GM/Owner) who isn't tied to a
-- single outlet and instead sees everything under their brand_id, enforced
-- via RLS (see the RLS migration) rather than at the schema level.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete set null,
  name text not null,
  phone text not null unique,
  email text unique,
  role text not null,
  access_tier access_tier not null,
  language_preference text not null default 'English',
  created_at timestamptz not null default now()
);

create index users_brand_id_idx on public.users(brand_id);
create index users_outlet_id_idx on public.users(outlet_id);

create table public.org_positions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  role_title text not null,
  reports_to_position_id uuid references public.org_positions(id) on delete set null,
  filled_by uuid references public.users(id) on delete set null,
  level int not null,
  created_at timestamptz not null default now()
);

create index org_positions_outlet_id_idx on public.org_positions(outlet_id);
create index org_positions_filled_by_idx on public.org_positions(filled_by);
