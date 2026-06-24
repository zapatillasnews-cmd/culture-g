-- Culture G — Supabase Schema
-- À exécuter dans l'éditeur SQL de ton projet Supabase

-- Table de progression utilisateur
create table if not exists public.user_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  card_id       int not null,
  category      text not null,
  correct       boolean not null,
  created_at    timestamptz default now()
);

-- Stats agrégées par utilisateur (vue)
create or replace view public.user_stats as
select
  user_id,
  count(*) as total_answers,
  sum(case when correct then 1 else 0 end) as correct_answers,
  count(distinct card_id) as unique_cards_seen,
  count(distinct date_trunc('day', created_at)) as days_active
from public.user_progress
group by user_id;

-- Row Level Security
alter table public.user_progress enable row level security;

create policy "Users can insert their own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

-- Index pour performances
create index on public.user_progress(user_id, created_at desc);
create index on public.user_progress(user_id, category);
