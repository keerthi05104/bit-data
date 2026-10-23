
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  original_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  category text not null default 'other',
  tags text[] not null default '{}',
  notes text not null default '',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists files_user_created_idx on public.files (user_id, created_at desc);
create index if not exists files_user_category_idx on public.files (user_id, category);
create index if not exists files_tags_gin_idx on public.files using gin (tags);

alter table public.files enable row level security;

-- Users may only read and mutate their own metadata if the anon/publishable key is used directly.
drop policy if exists "Users can read own files" on public.files;
create policy "Users can read own files" on public.files for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own files" on public.files;
create policy "Users can insert own files" on public.files for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own files" on public.files;
create policy "Users can update own files" on public.files for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own files" on public.files;
create policy "Users can delete own files" on public.files for delete to authenticated using (auth.uid() = user_id);
