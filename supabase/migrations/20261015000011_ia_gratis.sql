-- Quizuu · plano Grátis passa a ter 3 gerações com IA (no total, para experimentar)
create or replace function public.plan_limits(p_plan text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_plan
    when 'admin' then '{"quizzes":100000,"votacoes":100000,"ia":1000,"ia_periodo":"mes"}'::jsonb
    when 'pro'   then '{"quizzes":50,"votacoes":50,"ia":25,"ia_periodo":"mes"}'::jsonb
    else              '{"quizzes":15,"votacoes":15,"ia":3,"ia_periodo":"total"}'::jsonb end;
$$;

create or replace function public.my_ai_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (select public.plan_of(auth.uid()) as plano),
       a as (select * from public.ai_access where user_id = auth.uid()),
       l as (select public.plan_limits((select plano from p)) as lim)
  select jsonb_build_object(
    'plan', p.plano,
    'periodo', case when coalesce((select enabled from a), false) or p.plano <> 'free' then 'mes' else 'total' end,
    'enabled', true,
    'limit', case when coalesce((select enabled from a), false)
                  then greatest((select monthly_limit from a), case when p.plano = 'free' then 0 else (l.lim->>'ia')::int end)
                  else (l.lim->>'ia')::int end,
    'used', (select count(*) from public.ai_generations g
             where g.user_id = auth.uid()
               and g.created_at >= case
                     when p.plano = 'free' and not coalesce((select enabled from a), false) then '-infinity'::timestamptz
                     else date_trunc('month', now()) end)
  ) from p, l;
$$;
