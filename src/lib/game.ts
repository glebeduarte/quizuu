import { supabase } from './supabase'

// Estado da partida transmitido pelo host para os celulares.
// Nunca contém a resposta certa antes da revelação.
export type GameState =
  | { phase: 'lobby' }
  | { phase: 'question'; qIndex: number; total: number; optionIds: string[]; timeLimit: number; kind: string }
  | { phase: 'reveal'; qIndex: number; total: number; optionIds: string[]; correctIndex: number; counts: number[] }
  | { phase: 'leaderboard'; qIndex: number; total: number }
  | { phase: 'podium' }

export const channelFor = (sessionId: string) => supabase.channel(`sala:${sessionId}`, { config: { broadcast: { self: false } } })

export type PlayerSave = { playerId: string; token: string; sessionId: string; nickname: string }
const KEY = 'quizuu:jogador'
export const loadPlayer = (): PlayerSave | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
export const savePlayer = (p: PlayerSave | null) => { try { p ? localStorage.setItem(KEY, JSON.stringify(p)) : localStorage.removeItem(KEY) } catch { /* sem armazenamento */ } }

export const formatPoints = (n: number) => n.toLocaleString('pt-BR')
export const formatPin = (pin: string) => `${pin.slice(0, 3)} ${pin.slice(3)}`

export function randomPin() {
  const a = new Uint32Array(1); crypto.getRandomValues(a)
  return String(100000 + (a[0] % 900000))
}
