-- Quizuu · posição única e igual no telão e no celular
-- Desempate: mais pontos, depois menor tempo somado nos acertos, depois quem entrou primeiro.
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
      select p.id, row_number() over (order by p.score desc, p.correct_time_ms asc, p.joined_at asc) rk, count(*) over () n
      from public.players p where p.session_id = s.id and not p.kicked
    )
    select a.id is not null, coalesce(a.is_correct, false), coalesce(a.points, 0), pl.score, pl.streak, r.rk, r.n
    from r where r.id = pl.id;
end $$;
