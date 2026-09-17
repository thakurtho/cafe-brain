-- Outlet Brain — unified vector-search knowledge base.
--
-- Both halves of the merged Ask/Tell flow need the same thing: given what
-- an employee just said, find the small handful of records that are
-- actually relevant instead of reading everything (menu, recipes, SOPs,
-- training content, customers, vendors, machines, inventory items,
-- facility areas, staff) into every single prompt. That stops scaling the
-- moment this is a real café instead of a dozen-item dummy dataset.
--
-- One unified table rather than an embedding column bolted onto seven
-- different existing tables — simpler to search (one query, not seven
-- merged), simpler to extend later. Deliberately covers BOTH the
-- long-form knowledge content (recipes/SOPs/training/compliance) AND the
-- short entity records (customers/vendors/machines/menu items/inventory
-- items/facility areas/staff) — confirmed with you that treating these as
-- two different retrieval systems stopped making sense once Ask and Tell
-- became one flow.
--
-- Embeddings come from Voyage AI (voyage-3-lite, 512 dimensions) — see
-- lib/embeddings.ts. If the model ever changes, the vector column's
-- dimension is fixed at creation time; changing models means a new
-- column (or table) and re-embedding everything, not just an env var
-- flip.

create extension if not exists vector;

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  -- Which real table/row this chunk represents — a soft pointer (no FK,
  -- since source_table varies), same pattern as entity_type/entity_id
  -- elsewhere in this schema. Lets a search result be traced back to (and
  -- re-synced from) the record that produced it.
  source_table text not null,
  source_id uuid not null,
  title text not null,
  content text not null,
  embedding vector(512) not null,
  created_at timestamptz not null default now()
);

create index knowledge_chunks_outlet_id_idx on public.knowledge_chunks(outlet_id);
create unique index knowledge_chunks_source_idx on public.knowledge_chunks(source_table, source_id);

-- HNSW over cosine distance — the standard choice for text embeddings
-- (magnitude-invariant). Overkill at today's row counts, cheap to have
-- ready for real-café volume.
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

-- Supabase-js has no native operator syntax for "order by cosine distance
-- to this vector" — the standard pattern is a Postgres function called via
-- .rpc(), which is what lib/knowledge-search.ts uses.
create or replace function public.match_knowledge_chunks(
  query_embedding vector(512),
  match_outlet_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  source_table text,
  source_id uuid,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    kc.id, kc.source_table, kc.source_id, kc.title, kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.outlet_id = match_outlet_id
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
