-- Fecha o acesso público à função auxiliar criada pelo Supabase
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
