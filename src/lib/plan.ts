import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Plano = {
  plan: 'free' | 'pro' | 'admin'
  limits: { quizzes: number; votacoes: number; ia: number }
  quizzes: number
  votacoes: number
  ia: { enabled: boolean; limit: number; used: number; periodo?: 'mes' | 'total' }
  assinatura: { status: string; fim: string | null; cancela: boolean } | null
}

export const PRECO = 'R$ 25'

export function usePlano() {
  const [plano, setPlano] = useState<Plano | null>(null)
  const recarregar = () => supabase.rpc('my_plan').then(({ data }) => setPlano((data as Plano) ?? null))
  useEffect(() => { recarregar() }, [])
  return { plano, recarregar }
}

/** Mensagem amigável quando o banco recusa por limite do plano. */
export function limiteMsg(error: { message?: string } | null): string | null {
  const m = error?.message ?? ''
  if (m.includes('limite_plano_quizzes')) return 'Você chegou ao limite de quizzes do seu plano. Exclua algum ou assine o Pro para ter até 50.'
  if (m.includes('limite_plano_votacoes')) return 'Você chegou ao limite de votações do seu plano. Exclua alguma ou assine o Pro para ter até 50.'
  return null
}
