create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_slug_idx on public.maps (slug);
create index if not exists maps_owner_id_idx on public.maps (owner_id);
create index if not exists maps_data_gin_idx on public.maps using gin (data jsonb_path_ops);

alter table public.maps enable row level security;

drop policy if exists "Public maps are readable" on public.maps;
create policy "Public maps are readable"
on public.maps
for select
using (visibility = 'public' or auth.uid() = owner_id);

drop policy if exists "Owners can insert maps" on public.maps;
create policy "Owners can insert maps"
on public.maps
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Owners can update maps" on public.maps;
create policy "Owners can update maps"
on public.maps
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Owners can delete maps" on public.maps;
create policy "Owners can delete maps"
on public.maps
for delete
to authenticated
using (auth.uid() = owner_id);
