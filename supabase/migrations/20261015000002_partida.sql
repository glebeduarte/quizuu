-- Quizuu · sala ao vivo e partida
-- Só adições. O tempo e os pontos são calculados aqui, nunca no celular.

-- Jogador entra na sala pelo PIN (sem login)
create or replace function public.join_session(p_pin text, p_nickname text)
returns table (player_id uuid, reconnect_token uuid, session_id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare s public.sessions; nick text := btrim(p_nickname);
begin
  if char_length(nick) not between 1 and 20 then raise exception 'apelido_invalido'; end if;
  select * into s from public.sessions where pin = p_pin and status <> 'finished' order by created_at desc limit 1;
  if s.id is null then raise exception 'pin_nao_encontrado'; end if;
  if s.status <> 'lobby' then raise exception 'partida_em_andamento'; end if;
  if exists (select 1 from public.players p where p.session_id = s.id and lower(p.nickname) = lower(nick)) then
    raise exception 'apelido_em_uso';
  end if;
  return query insert into public.players (session_id, nickname) values (s.id, nick)
    returning id, players.reconnect_token, players.session_id;
end $$;

-- Jogador volta para a sala depois de recarregar a página
create or replace function public.rejoin_session(p_player_id uuid, p_token uuid)
returns table (session_id uuid, nickname text, score int, status text, kicked boolean)
language sql security definer set search_path = '' as $$
  select p.session_id, p.nickname, p.score, s.status, p.kicked
  from public.players p join public.sessions s on s.id = p.session_id
  where p.id = p_player_id and p.reconnect_token = p_token
$$;

-- Host abre uma pergunta: o relógio de referência é o do servidor
create or replace function public.open_question(p_session_id uuid, p_question_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare t timestamptz := clock_timestamp();
begin
  update public.sessions s set status = 'question', current_question_id = p_question_id, question_started_at = t
  where s.id = p_session_id and s.host_id = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = p_question_id and q.quiz_id = s.quiz_id);
  if not found then raise exception 'sem_permissao'; end if;
  return t;
end $$;

-- Jogador responde: valida, mede o tempo no servidor e soma os pontos
create or replace function public.submit_answer(p_player_id uuid, p_token uuid, p_option_id uuid)
returns table (accepted boolean, elapsed_ms int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare pl public.players; s public.sessions; q public.questions; o public.options;
        ms int; ok boolean; pts int; streak_bonus int;
begin
  select * into pl from public.players where id = p_player_id and reconnect_token = p_token and not kicked;
  if pl.id is null then raise exception 'jogador_invalido'; end if;
  select * into s from public.sessions where id = pl.session_id;
  if s.status <> 'question' then return query select false, 0; return; end if;
  select * into q from public.questions where id = s.current_question_id;
  ms := (extract(epoch from (clock_timestamp() - s.question_started_at)) * 1000)::int;
  if ms > q.time_limit_s * 1000 + 500 then return query select false, ms; return; end if;
  select * into o from public.options where id = p_option_id and question_id = q.id;
  if o.id is null then raise exception 'opcao_invalida'; end if;
  ok := o.is_correct;
  pts := public.calc_points(ms, q.time_limit_s, q.points_multiplier, ok);
  streak_bonus := case when ok and pl.streak >= 1 and q.points_multiplier > 0 then least(pl.streak * 100, 500) else 0 end;
  begin
    insert into public.answers (session_id, player_id, question_id, option_id, elapsed_ms, is_correct, points)
    values (s.id, pl.id, q.id, o.id, ms, ok, pts + streak_bonus);
  exception when unique_violation then
    return query select false, ms; return;
  end;
  update public.players set score = score + pts + streak_bonus,
    streak = case when ok then streak + 1 else 0 end,
    correct_time_ms = correct_time_ms + case when ok then ms else 0 end
  where id = pl.id;
  return query select true, ms;
end $$;

-- Resultado do jogador na pergunta atual (só depois da revelação)
create or replace function public.my_result(p_player_id uuid, p_token uuid)
returns table (answered boolean, is_correct boolean, points int, score int, streak int, rank bigint, total bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare pl public.players; s public.sessions; a public.answers;
begin
  select * into pl from public.players where id = p_player_id and reconnect_token = p_token;
  if pl.id is null then raise exception 'jogador_invalido'; end if;
  select * into s from public.sessions where id = pl.session_id;
  if s.status not in ('reveal','leaderboard','finished') then raise exception 'ainda_nao'; end if;
  select * into a from public.answers where player_id = pl.id and question_id = s.current_question_id;
  return query
    with r as (
      select id, rank() over (order by p.score desc, p.correct_time_ms asc) rk, count(*) over () n
      from public.players p where p.session_id = s.id and not p.kicked
    )
    select a.id is not null, coalesce(a.is_correct, false), coalesce(a.points, 0), pl.score, pl.streak, r.rk, r.n
    from r where r.id = pl.id;
end $$;

-- Host remove jogador
create policy "host remove jogador" on public.players for update
  using (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = (select auth.uid())))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = (select auth.uid())));

revoke execute on function public.join_session(text, text) from public;
revoke execute on function public.rejoin_session(uuid, uuid) from public;
revoke execute on function public.open_question(uuid, uuid) from public, anon;
revoke execute on function public.submit_answer(uuid, uuid, uuid) from public;
revoke execute on function public.my_result(uuid, uuid) from public;
grant execute on function public.join_session(text, text) to anon, authenticated;
grant execute on function public.rejoin_session(uuid, uuid) to anon, authenticated;
grant execute on function public.open_question(uuid, uuid) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.my_result(uuid, uuid) to anon, authenticated;
