-- Quizuu · planos (Grátis e Pro) com assinatura via Stripe
-- Rodar DEPOIS de 20261015000009_admin.sql

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "vê a própria assinatura" on public.subscriptions;
create policy "vê a própria assinatura" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));

-- Plano da conta: 'admin', 'pro' ou 'free'
create or replace function public.plan_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.admins a where a.user_id = p_user) then 'admin'
    when exists (select 1 from public.subscriptions s where s.user_id = p_user
                 and s.status in ('active','trialing','past_due')
                 and (s.current_period_end is null or s.current_period_end > now() - interval '3 days')) then 'pro'
    else 'free' end;
$$;

create or replace function public.plan_limits(p_plan text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_plan
    when 'admin' then '{"quizzes":100000,"votacoes":100000,"ia":1000}'::jsonb
    when 'pro'   then '{"quizzes":50,"votacoes":50,"ia":25}'::jsonb
    else              '{"quizzes":15,"votacoes":15,"ia":0}'::jsonb end;
$$;

-- Acesso à IA: plano Pro (25/mês), liberação manual pelo admin, ou admin
create or replace function public.my_ai_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (select public.plan_of(auth.uid()) as plano),
       a as (select * from public.ai_access where user_id = auth.uid())
  select jsonb_build_object(
    'plan', p.plano,
    'enabled', p.plano in ('admin','pro') or coalesce((select enabled from a), false),
    'limit', greatest(
      (public.plan_limits(p.plano)->>'ia')::int,
      case when coalesce((select enabled from a), false) then (select monthly_limit from a) else 0 end),
    'used', (select count(*) from public.ai_generations g
             where g.user_id = auth.uid() and g.created_at >= date_trunc('month', now()))
  ) from p;
$$;

create or replace function public.my_plan() returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (select public.plan_of(auth.uid()) as plano)
  select jsonb_build_object(
    'plan', p.plano,
    'limits', public.plan_limits(p.plano),
    'quizzes', (select count(*) from public.quizzes where owner_id = auth.uid()),
    'votacoes', (select count(*) from public.polls where owner_id = auth.uid()),
    'ia', public.my_ai_access(),
    'assinatura', (select jsonb_build_object('status', status, 'fim', current_period_end, 'cancela', cancel_at_period_end)
                   from public.subscriptions where user_id = auth.uid())
  ) from p;
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Limites aplicados no banco
create or replace function public.enforce_quiz_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int := (public.plan_limits(public.plan_of(new.owner_id))->>'quizzes')::int;
begin
  if (select count(*) from public.quizzes where owner_id = new.owner_id) >= lim then
    raise exception 'limite_plano_quizzes' using hint = lim::text;
  end if;
  return new;
end $$;
drop trigger if exists quizzes_limite on public.quizzes;
create trigger quizzes_limite before insert on public.quizzes for each row execute function public.enforce_quiz_limit();

create or replace function public.enforce_poll_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int := (public.plan_limits(public.plan_of(new.owner_id))->>'votacoes')::int;
begin
  if (select count(*) from public.polls where owner_id = new.owner_id) >= lim then
    raise exception 'limite_plano_votacoes' using hint = lim::text;
  end if;
  return new;
end $$;
drop trigger if exists polls_limite on public.polls;
create trigger polls_limite before insert on public.polls for each row execute function public.enforce_poll_limit();

-- Admin: assinaturas
create or replace function public.admin_subscriptions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', s.user_id, 'email', u.email, 'status', s.status, 'fim', s.current_period_end,
      'cancela', s.cancel_at_period_end, 'atualizado', s.updated_at, 'customer', s.stripe_customer_id,
      'plano', public.plan_of(s.user_id)
    ) order by s.updated_at desc), '[]'::jsonb)
    from public.subscriptions s join auth.users u on u.id = s.user_id);
end $$;
revoke all on function public.admin_subscriptions() from public, anon;
grant execute on function public.admin_subscriptions() to authenticated;
