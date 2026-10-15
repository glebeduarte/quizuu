import { supabase } from './supabase'

export type PollQuestion = { id: string; kind: 'choice' | 'words'; prompt: string; options: string[] }
export type WordCount = { w: string; n: number }
export type PollState = {
  title: string; open: boolean; position: number; current?: number; total: number
  question: PollQuestion | null; results?: number[] | WordCount[]; voters?: number
} | null

export const pollChannel = (code: string) =>
  supabase.channel(`poll:${code.toUpperCase()}`, { config: { broadcast: { self: false } } })

export async function fetchPoll(code: string, position?: number): Promise<PollState> {
  const { data } = await supabase.rpc('poll_public', { p_code: code, p_position: position ?? null })
  return (data as PollState) ?? null
}

export function voterId() {
  const k = 'quizuu:votante'
  try {
    let v = localStorage.getItem(k)
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v) }
    return v
  } catch { return crypto.randomUUID() }
}

export function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const a = new Uint32Array(6); crypto.getRandomValues(a)
  return Array.from(a, (n) => chars[n % chars.length]).join('')
}

export const voteUrl = (code: string) => `${window.location.origin}/v/${code}`
export const screenUrl = (code: string, key: string, position?: number) =>
  `${window.location.origin}/v/${code}/tela?k=${key}${position ? `&p=${position}` : ''}`

export const embedUrl = (code: string, key: string, position?: number) =>
  `${window.location.origin}/embed/${code}?k=${key}${position ? `&p=${position}` : ''}`
