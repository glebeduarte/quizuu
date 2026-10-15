-- Quizuu · votações ao vivo para apresentações (múltipla escolha e nuvem de palavras)

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Votação sem título' check (char_length(title) between 1 and 120),
  code char(6) not null unique,
  host_key uuid not null default gen_random_uuid(),
  current_position int not null default 1,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.poll_questions (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  position int not null,
  kind text not null default 'choice' check (kind in ('choice','words')),
  prompt text not null default '' check (char_length(prompt) <= 200),
  options text[] not null default '{}',
  unique (poll_id, position) deferrable initially immediate
);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  question_id uuid not null references public.poll_questions(id) on delete cascade,
  voter uuid not null,
  option_index int,
  word text,
  created_at timestamptz not null default now()
);
create index on public.poll_questions(poll_id);
create index on public.poll_votes(question_id);
create unique index poll_votes_one_choice on public.poll_votes(question_id, voter) where option_index is not null;
create unique index poll_votes_word_once on public.poll_votes(question_id, voter, word) where word is not null;

alter table public.polls enable row level security;
alter table public.poll_questions enable row level security;
alter table public.poll_votes enable row level security;

create policy "dono gerencia votações" on public.polls for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "dono gerencia perguntas da votação" on public.poll_questions for all
  using (exists (select 1 from public.polls p where p.id = poll_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.polls p where p.id = poll_id and p.owner_id = (select auth.uid())));
create policy "dono vê votos" on public.poll_votes for select
  using (exists (select 1 from public.polls p where p.id = poll_id and p.owner_id = (select auth.uid())));
create policy "dono apaga votos" on public.poll_votes for delete
  using (exists (select 1 from public.polls p where p.id = poll_id and p.owner_id = (select auth.uid())));

-- Estado público: pergunta da vez (ou uma posição específica) com resultados agregados
create or replace function public.poll_public(p_code text, p_position int default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.polls; q public.poll_questions; total int; voters int; res jsonb;
begin
  select * into p from public.polls where code = upper(p_code);
  if p.id is null then return null; end if;
  select * into q from public.poll_questions where poll_id = p.id and position = coalesce(p_position, p.current_position);
  select count(*) into total from public.poll_questions where poll_id = p.id;
  if q.id is null then
    return jsonb_build_object('title', p.title, 'open', p.is_open, 'position', coalesce(p_position, p.current_position), 'total', total, 'question', null);
  end if;
  select count(distinct voter) into voters from public.poll_votes where question_id = q.id;
  if q.kind = 'choice' then
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by i), '[]') into res
    from generate_series(0, coalesce(array_length(q.options, 1), 0) - 1) i
    left join (select option_index, count(*) n from public.poll_votes where question_id = q.id group by option_index) c on c.option_index = i;
  else
    select coalesce(jsonb_agg(jsonb_build_object('w', w, 'n', n) order by n desc, w), '[]') into res
    from (select word w, count(*) n from public.poll_votes where question_id = q.id group by word order by count(*) desc, word limit 60) t;
  end if;
  return jsonb_build_object(
    'title', p.title, 'open', p.is_open, 'position', q.position, 'current', p.current_position, 'total', total,
    'question', jsonb_build_object('id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'options', to_jsonb(q.options)),
    'results', res, 'voters', voters);
end $$;

-- Voto anônimo (identificado por um id aleatório guardado no celular)
create or replace function public.poll_vote(p_code text, p_voter uuid, p_question_id uuid, p_option int default null, p_word text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.polls; q public.poll_questions; w text; mine int;
begin
  select * into p from public.polls where code = upper(p_code);
  if p.id is null then raise exception 'votacao_nao_encontrada'; end if;
  if not p.is_open then raise exception 'votacao_fechada'; end if;
  select * into q from public.poll_questions where id = p_question_id and poll_id = p.id;
  if q.id is null or q.position <> p.current_position then raise exception 'pergunta_encerrada'; end if;
  if q.kind = 'choice' then
    if p_option is null or p_option < 0 or p_option >= coalesce(array_length(q.options, 1), 0) then raise exception 'opcao_invalida'; end if;
    insert into public.poll_votes (poll_id, question_id, voter, option_index) values (p.id, q.id, p_voter, p_option)
    on conflict (question_id, voter) where option_index is not null do update set option_index = excluded.option_index, created_at = now();
  else
    w := lower(btrim(regexp_replace(coalesce(p_word, ''), '\s+', ' ', 'g')));
    if char_length(w) not between 1 and 25 then raise exception 'palavra_invalida'; end if;
    if public.nickname_is_offensive(w) then raise exception 'palavra_bloqueada'; end if;
    select count(*) into mine from public.poll_votes where question_id = q.id and voter = p_voter;
    if mine >= 3 then raise exception 'limite_palavras'; end if;
    insert into public.poll_votes (poll_id, question_id, voter, word) values (p.id, q.id, p_voter, w)
    on conflict (question_id, voter, word) where word is not null do nothing;
  end if;
  return 'ok';
end $$;

-- O que este celular já votou na pergunta
create or replace function public.poll_my_votes(p_question_id uuid, p_voter uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'option', (select option_index from public.poll_votes where question_id = p_question_id and voter = p_voter and option_index is not null limit 1),
    'words', coalesce((select jsonb_agg(word) from public.poll_votes where question_id = p_question_id and voter = p_voter and word is not null), '[]'))
$$;

-- Tela da apresentação: avança e abre/fecha usando a chave do apresentador
create or replace function public.poll_control(p_code text, p_key uuid, p_position int default null, p_open boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.polls set
    current_position = coalesce(p_position, current_position),
    is_open = coalesce(p_open, is_open), updated_at = now()
  where code = upper(p_code) and host_key = p_key;
  if not found then raise exception 'sem_permissao'; end if;
end $$;

revoke execute on function public.poll_public(text, int) from public;
revoke execute on function public.poll_vote(text, uuid, uuid, int, text) from public;
revoke execute on function public.poll_my_votes(uuid, uuid) from public;
revoke execute on function public.poll_control(text, uuid, int, boolean) from public;
grant execute on function public.poll_public(text, int) to anon, authenticated;
grant execute on function public.poll_vote(text, uuid, uuid, int, text) to anon, authenticated;
grant execute on function public.poll_my_votes(uuid, uuid) to anon, authenticated;
grant execute on function public.poll_control(text, uuid, int, boolean) to anon, authenticated;
