-- Quizuu · área privada para materiais enviados à IA (até 30 MB, apagados depois do uso)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiais', 'materiais', false, 31457280,
  array['application/pdf','text/plain','text/markdown','image/png','image/jpeg','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "organizador envia material" on storage.objects for insert to authenticated
  with check (bucket_id = 'materiais' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "organizador lê o próprio material" on storage.objects for select to authenticated
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "organizador apaga o próprio material" on storage.objects for delete to authenticated
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = (select auth.uid())::text);
