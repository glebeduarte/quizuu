-- Quizuu · editor de quiz, imagens e login sem verificação de e-mail
-- Só adições: nada é apagado.

-- 1. Salva o quiz inteiro numa transação, respeitando as regras de acesso
create or replace function public.save_quiz(p_quiz_id uuid, p_title text, p_questions jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare q jsonb; o jsonb; qi int; oi int; q_ids uuid[]; o_ids uuid[];
begin
  update public.quizzes set title = p_title, updated_at = now()
   where id = p_quiz_id and owner_id = (select auth.uid());
  if not found then raise exception 'Quiz não encontrado' using errcode = 'P0002'; end if;
  select coalesce(array_agg((e->>'id')::uuid), '{}') into q_ids from jsonb_array_elements(p_questions) e;
  delete from public.questions where quiz_id = p_quiz_id and not (id = any(q_ids));
  update public.questions set position = -position - 1000 where quiz_id = p_quiz_id;
  for q, qi in select e, ord::int from jsonb_array_elements(p_questions) with ordinality as t(e, ord) loop
    insert into public.questions (id, quiz_id, position, kind, prompt, media_url, time_limit_s, points_multiplier)
    values ((q->>'id')::uuid, p_quiz_id, qi, q->>'kind', q->>'prompt', nullif(q->>'media_url',''),
            (q->>'time_limit_s')::int, (q->>'points_multiplier')::numeric)
    on conflict (id) do update set position = excluded.position, kind = excluded.kind, prompt = excluded.prompt,
      media_url = excluded.media_url, time_limit_s = excluded.time_limit_s, points_multiplier = excluded.points_multiplier
    where public.questions.quiz_id = p_quiz_id;
    select coalesce(array_agg((e->>'id')::uuid), '{}') into o_ids from jsonb_array_elements(q->'options') e;
    delete from public.options where question_id = (q->>'id')::uuid and not (id = any(o_ids));
    update public.options set position = position + 10 where question_id = (q->>'id')::uuid;
    for o, oi in select e, (ord - 1)::int from jsonb_array_elements(q->'options') with ordinality as t(e, ord) loop
      insert into public.options (id, question_id, position, label, is_correct)
      values ((o->>'id')::uuid, (q->>'id')::uuid, oi, o->>'label', (o->>'is_correct')::boolean)
      on conflict (id) do update set position = excluded.position, label = excluded.label, is_correct = excluded.is_correct;
    end loop;
  end loop;
end $$;
revoke execute on function public.save_quiz(uuid, text, jsonb) from public, anon;
grant execute on function public.save_quiz(uuid, text, jsonb) to authenticated;

-- 2. Imagens das perguntas: leitura pública, escrita só na pasta do próprio organizador
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midia', 'midia', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "organizador envia imagens" on storage.objects for insert to authenticated
  with check (bucket_id = 'midia' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "organizador apaga imagens" on storage.objects for delete to authenticated
  using (bucket_id = 'midia' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3. Cadastro sem verificação de e-mail: o organizador já entra confirmado
create or replace function public.auto_confirm_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;
revoke execute on function public.auto_confirm_user() from public, anon, authenticated;
create trigger auto_confirm_user before insert on auth.users
  for each row execute function public.auto_confirm_user();
