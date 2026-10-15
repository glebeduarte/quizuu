-- Quizuu · filtro de palavrões nos apelidos
-- Normaliza acentos, números usados como letras e repetições antes de comparar.

create or replace function public.nickname_is_offensive(p text)
returns boolean language sql immutable set search_path = '' as $$
  with base as (
    select translate(lower(p), 'áàâãäéèêëíìîïóòôõöúùûüç013457@$!', 'aaaaaeeeeiiiiooooouuuucoieastaasi') as t
  ), whole as (  -- texto inteiro só com letras e sem letras repetidas
    select regexp_replace(regexp_replace(t, '[^a-z]', '', 'g'), '(.)\1+', '\1', 'g') as t from base
  ), words as (  -- cada palavra separada
    select regexp_replace(w, '(.)\1+', '\1', 'g') as w
    from base, regexp_split_to_table(regexp_replace(base.t, '[^a-z]+', ' ', 'g'), ' ') w where w <> ''
  )
  select exists (
    select 1 from whole, unnest(array[
      'caralh','buceta','boceta','xoxota','xereca','piroca','cuzao','cusao','filhadaputa','filhodaputa',
      'putinha','vadia','vagabund','arombad','fuder','fudid','merda','bosta','cacete','punheta','siririca',
      'traveco','crioulo','retardad','escroto','otario','piranha','rapariga','nazi','hitler','estupr','pedofil',
      'fuck','shit','bitch','pusy','nigg','whore','slut','cunt','ashole'
    ]) w where position(w in whole.t) > 0
  ) or exists (
    select 1 from words where w = any(array[
      'cu','fdp','puta','puto','pica','rola','penis','vagina','anus','sexo','fode','foder','viado','veado',
      'bicha','sapatao','macaco','mongol','corno','babaca','pora','dick','cok','sex'
    ])
  )
$$;

create or replace function public.join_session(p_pin text, p_nickname text)
returns table (player_id uuid, reconnect_token uuid, session_id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare s public.sessions; nick text := btrim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
begin
  if char_length(nick) not between 1 and 20 then raise exception 'apelido_invalido'; end if;
  if public.nickname_is_offensive(nick) then raise exception 'apelido_ofensivo'; end if;
  select * into s from public.sessions where pin = p_pin and status <> 'finished' order by created_at desc limit 1;
  if s.id is null then raise exception 'pin_nao_encontrado'; end if;
  if s.status <> 'lobby' then raise exception 'partida_em_andamento'; end if;
  if exists (select 1 from public.players p where p.session_id = s.id and lower(p.nickname) = lower(nick)) then
    raise exception 'apelido_em_uso';
  end if;
  return query insert into public.players (session_id, nickname) values (s.id, nick)
    returning id, players.reconnect_token, players.session_id;
end $$;

revoke execute on function public.nickname_is_offensive(text) from public, anon, authenticated;
