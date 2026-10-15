-- Quizuu · área de administração + IA liberada por conta (rodar uma vez no SQL Editor)
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

-- =========================================================
-- IA liberada por conta + medição de consumo
-- =========================================================
alter table public.ai_generations
  add column if not exists model text,
  add column if not exists tokens_in int not null default 0,
  add column if not exists tokens_out int not null default 0;

create table public.ai_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  monthly_limit int not null default 30 check (monthly_limit between 0 and 100000),
  updated_at timestamptz not null default now()
);
alter table public.ai_access enable row level security;

create table public.ai_settings (
  id boolean primary key default true check (id),
  price_in_per_m numeric not null default 0,   -- R$ por 1 milhão de tokens de entrada
  price_out_per_m numeric not null default 0,  -- R$ por 1 milhão de tokens de saída
  monthly_budget numeric not null default 0,   -- orçamento mensal em R$
  default_limit int not null default 30,
  updated_at timestamptz not null default now()
);
insert into public.ai_settings default values on conflict do nothing;
alter table public.ai_settings enable row level security;

-- Acesso da própria conta (usado pela tela e pela função do Gemini)
create or replace function public.my_ai_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enabled', coalesce(a.enabled, false) or public.is_admin(),
    'limit', case when a.user_id is null and public.is_admin() then 1000 else coalesce(a.monthly_limit, 0) end,
    'used', (select count(*) from public.ai_generations g
             where g.user_id = auth.uid() and g.created_at >= date_trunc('month', now()))
  )
  from (select 1) x left join public.ai_access a on a.user_id = auth.uid();
$$;
revoke all on function public.my_ai_access() from public, anon;
grant execute on function public.my_ai_access() to authenticated;

create or replace function public.admin_set_ai_access(p_user uuid, p_enabled boolean, p_limit int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  insert into public.ai_access(user_id, enabled, monthly_limit, updated_at)
  values (p_user, p_enabled, greatest(0, coalesce(p_limit, 30)), now())
  on conflict (user_id) do update set enabled = excluded.enabled, monthly_limit = excluded.monthly_limit, updated_at = now();
end $$;

create or replace function public.admin_set_ai_settings(p_in numeric, p_out numeric, p_budget numeric, p_default int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  update public.ai_settings set price_in_per_m = greatest(0, p_in), price_out_per_m = greatest(0, p_out),
    monthly_budget = greatest(0, p_budget), default_limit = greatest(0, p_default), updated_at = now();
end $$;

create or replace function public.admin_ai() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.ai_settings; mes timestamptz := date_trunc('month', now()); r jsonb;
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  select * into s from public.ai_settings limit 1;
  select jsonb_build_object(
    'config', jsonb_build_object('price_in', s.price_in_per_m, 'price_out', s.price_out_per_m,
                                 'budget', s.monthly_budget, 'default_limit', s.default_limit),
    'mes', (select jsonb_build_object(
        'geracoes', count(*), 'tokens_in', coalesce(sum(tokens_in),0), 'tokens_out', coalesce(sum(tokens_out),0),
        'custo', coalesce(sum(tokens_in),0) / 1e6 * s.price_in_per_m + coalesce(sum(tokens_out),0) / 1e6 * s.price_out_per_m)
      from public.ai_generations where created_at >= mes),
    'por_origem', (select coalesce(jsonb_agg(jsonb_build_object(
        'origem', source, 'geracoes', c, 'media_in', mi, 'media_out', mo,
        'custo_medio', mi / 1e6 * s.price_in_per_m + mo / 1e6 * s.price_out_per_m)), '[]'::jsonb)
      from (select source, count(*) c, avg(tokens_in) mi, avg(tokens_out) mo
            from public.ai_generations where tokens_in > 0 group by source) o),
    'diario', (select jsonb_agg(jsonb_build_object('dia', d::date,
        'tokens', (select coalesce(sum(tokens_in + tokens_out),0) from public.ai_generations g where g.created_at::date = d::date),
        'geracoes', (select count(*) from public.ai_generations g where g.created_at::date = d::date)) order by d)
      from generate_series(current_date - 29, current_date, interval '1 day') d),
    'contas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'admin', (ad.user_id is not null),
        'enabled', coalesce(a.enabled, false) or ad.user_id is not null,
        'liberado_manual', coalesce(a.enabled, false),
        'limit', coalesce(a.monthly_limit, s.default_limit),
        'usadas_mes', (select count(*) from public.ai_generations g where g.user_id = u.id and g.created_at >= mes),
        'tokens_mes', (select coalesce(sum(tokens_in + tokens_out),0) from public.ai_generations g where g.user_id = u.id and g.created_at >= mes),
        'custo_mes', (select coalesce(sum(tokens_in),0) / 1e6 * s.price_in_per_m + coalesce(sum(tokens_out),0) / 1e6 * s.price_out_per_m
                      from public.ai_generations g where g.user_id = u.id and g.created_at >= mes)
      )), '[]'::jsonb)
      from auth.users u left join public.ai_access a on a.user_id = u.id left join public.admins ad on ad.user_id = u.id)
  ) into r;
  return r;
end $$;

revoke all on function public.admin_set_ai_access(uuid,boolean,int) from public, anon;
revoke all on function public.admin_set_ai_settings(numeric,numeric,numeric,int) from public, anon;
revoke all on function public.admin_ai() from public, anon;
grant execute on function public.admin_set_ai_access(uuid,boolean,int) to authenticated;
grant execute on function public.admin_set_ai_settings(numeric,numeric,numeric,int) to authenticated;
grant execute on function public.admin_ai() to authenticated;
