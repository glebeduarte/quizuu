-- Quizuu · esquema inicial
-- Organizadores usam Supabase Auth. Jogadores são anônimos e falam com o banco
-- apenas por Edge Functions (service role), então não recebem políticas diretas.

create extension if not exists pgcrypto;

-- Perfis dos organizadores
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  cover_url text,
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private','public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position int not null,
  kind text not null default 'multiple_choice' check (kind in ('multiple_choice','true_false')),
  prompt text not null check (char_length(prompt) between 1 and 300),
  media_url text,
  time_limit_s int not null default 20 check (time_limit_s between 5 and 120),
  points_multiplier numeric(3,1) not null default 1 check (points_multiplier in (0,1,2)),
  unique (quiz_id, position)
);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position int not null check (position between 0 and 3),
  label text not null check (char_length(label) between 1 and 120),
  is_correct boolean not null default false,
  unique (question_id, position)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  pin char(6) not null,
  status text not null default 'lobby' check (status in ('lobby','question','reveal','leaderboard','finished')),
  current_question_id uuid references public.questions(id),
  question_started_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- PIN só precisa ser único entre salas abertas
create unique index sessions_open_pin on public.sessions(pin) where status <> 'finished';

create table public.players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  reconnect_token uuid not null default gen_random_uuid(),
  score int not null default 0,
  streak int not null default 0,
  correct_time_ms bigint not null default 0,
  kicked boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (session_id, nickname)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  option_id uuid references public.options(id),
  received_at timestamptz not null default now(),
  elapsed_ms int not null,
  is_correct boolean not null,
  points int not null default 0,
  unique (player_id, question_id)
);

create index on public.questions(quiz_id);
create index on public.options(question_id);
create index on public.players(session_id);
create index on public.answers(session_id, question_id);

-- Pontuação (fonte única da fórmula)
create or replace function public.calc_points(elapsed_ms int, limit_s int, multiplier numeric, correct boolean)
returns int language sql immutable as $$
  select case when not correct or multiplier = 0 then 0
    else round(1000 * multiplier * (1 - least(greatest(elapsed_ms,0)::numeric / (limit_s*1000), 1) / 2))::int end
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.quizzes  enable row level security;
alter table public.questions enable row level security;
alter table public.options  enable row level security;
alter table public.sessions enable row level security;
alter table public.players  enable row level security;
alter table public.answers  enable row level security;

create policy "perfil próprio" on public.profiles for all
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "dono gerencia quizzes" on public.quizzes for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "quizzes públicos visíveis" on public.quizzes for select
  using (visibility = 'public');

create policy "dono gerencia perguntas" on public.questions for all
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = (select auth.uid())));

create policy "dono gerencia opções" on public.options for all
  using (exists (select 1 from public.questions qu join public.quizzes q on q.id = qu.quiz_id
                 where qu.id = question_id and q.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.questions qu join public.quizzes q on q.id = qu.quiz_id
                 where qu.id = question_id and q.owner_id = (select auth.uid())));

create policy "host gerencia salas" on public.sessions for all
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "host vê jogadores" on public.players for select
  using (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = (select auth.uid())));
create policy "host vê respostas" on public.answers for select
  using (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = (select auth.uid())));

-- Cria perfil ao cadastrar organizador
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
