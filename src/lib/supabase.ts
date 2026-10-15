import { createClient } from '@supabase/supabase-js'

// Valores públicos do projeto (a chave publicável é feita para ficar no navegador).
// Variáveis de ambiente, se existirem, têm prioridade.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://ekdffjubkhsrmoprsylw.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || 'sb_publishable_G9IOb70jywn8RlNjh3kIoA_Pata2ONt'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
