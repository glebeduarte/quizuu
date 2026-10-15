-- Quizuu · registro de gerações por IA (limite diário por organizador)
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  source text not null check (source in ('tema','material')),
  questions int not null default 0
);
create index on public.ai_generations(user_id, created_at desc);
alter table public.ai_generations enable row level security;
create policy "vê as próprias gerações" on public.ai_generations for select using (user_id = (select auth.uid()));
create policy "registra as próprias gerações" on public.ai_generations for insert with check (user_id = (select auth.uid()));
