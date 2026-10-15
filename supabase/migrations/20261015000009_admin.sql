-- Área de administração
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "admin vê a si" on public.admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  select jsonb_build_object(
    'totais', jsonb_build_object(
      'usuarios', (select count(*) from auth.users),
      'usuarios_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'ativos_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'quizzes', (select count(*) from public.quizzes),
      'perguntas', (select count(*) from public.questions),
      'partidas', (select count(*) from public.sessions),
      'partidas_finalizadas', (select count(*) from public.sessions where status = 'finished'),
      'jogadores', (select count(*) from public.players),
      'respostas', (select count(*) from public.answers),
      'votacoes', (select count(*) from public.polls),
      'votos', (select count(*) from public.poll_votes),
      'geracoes_ia', (select count(*) from public.ai_generations),
      'geracoes_ia_tema', (select count(*) from public.ai_generations where source = 'tema'),
      'geracoes_ia_material', (select count(*) from public.ai_generations where source = 'material'),
      'perguntas_ia', (select coalesce(sum(questions),0) from public.ai_generations)
    ),
    'diario', (
      select jsonb_agg(jsonb_build_object(
        'dia', d::date,
        'cadastros', (select count(*) from auth.users u where u.created_at::date = d::date),
        'partidas', (select count(*) from public.sessions s where s.created_at::date = d::date),
        'jogadores', (select count(*) from public.players p where p.joined_at::date = d::date),
        'votos', (select count(*) from public.poll_votes v where v.created_at::date = d::date),
        'ia', (select count(*) from public.ai_generations g where g.created_at::date = d::date)
      ) order by d)
      from generate_series(current_date - 29, current_date, interval '1 day') d
    ),
    'usuarios', (
      select coalesce(jsonb_agg(x order by x.pontos desc, x.criado desc), '[]'::jsonb) from (
        select u.id, u.email, u.created_at as criado, u.last_sign_in_at as ultimo_login,
          (a.user_id is not null) as admin,
          (select count(*) from public.quizzes q where q.owner_id = u.id) as quizzes,
          (select count(*) from public.sessions s where s.host_id = u.id) as partidas,
          (select count(*) from public.players p join public.sessions s on s.id = p.session_id where s.host_id = u.id) as jogadores,
          (select count(*) from public.polls o where o.owner_id = u.id) as votacoes,
          (select count(*) from public.poll_votes v join public.polls o on o.id = v.poll_id where o.owner_id = u.id) as votos,
          (select count(*) from public.ai_generations g where g.user_id = u.id) as ia,
          (select count(*) from public.sessions s where s.host_id = u.id) * 10
            + (select count(*) from public.players p join public.sessions s on s.id = p.session_id where s.host_id = u.id)
            + (select count(*) from public.polls o where o.owner_id = u.id) * 10
            + (select count(*) from public.poll_votes v join public.polls o on o.id = v.poll_id where o.owner_id = u.id)
            + (select count(*) from public.ai_generations g where g.user_id = u.id) * 5 as pontos
        from auth.users u left join public.admins a on a.user_id = u.id
      ) x
    )
  ) into r;
  return r;
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

insert into public.admins (user_id) select id from auth.users where email = 'glebejr@gmail.com'
on conflict do nothing;

-- Ações de admin (sem Edge Function)
create or replace function public.admin_reset_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  if char_length(coalesce(p_password,'')) < 6 then raise exception 'senha_curta'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
    updated_at = now() where id = p_user;
  if not found then raise exception 'usuario_nao_encontrado'; end if;
end $$;

create or replace function public.admin_set_admin(p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  if p_user = auth.uid() and not p_value then raise exception 'nao_pode_remover_a_si'; end if;
  if p_value then insert into public.admins(user_id) values (p_user) on conflict do nothing;
  else delete from public.admins where user_id = p_user; end if;
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  if p_user = auth.uid() then raise exception 'nao_pode_excluir_a_si'; end if;
  delete from auth.users where id = p_user;
end $$;

revoke all on function public.admin_reset_password(uuid,text) from public, anon;
revoke all on function public.admin_set_admin(uuid,boolean) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_reset_password(uuid,text) to authenticated;
grant execute on function public.admin_set_admin(uuid,boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
