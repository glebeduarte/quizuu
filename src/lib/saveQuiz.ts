import { supabase } from './supabase'

type Opt = { id: string; label: string; is_correct: boolean }
type Q = { id: string; kind: string; prompt: string; media_url: string; time_limit_s: number; points_multiplier: number; options: Opt[] }

// Salva o quiz inteiro usando as regras de acesso de cada tabela.
// Perguntas e opções mantêm seus ids, então partidas já jogadas continuam com o histórico.
export async function saveQuiz(quizId: string, title: string, questions: Q[]) {
  const fail = (e: unknown) => { if (e) throw e }

  fail((await supabase.from('quizzes').update({ title, updated_at: new Date().toISOString() }).eq('id', quizId)).error)

  const { data: existing, error } = await supabase.from('questions').select('id, options(id)').eq('quiz_id', quizId)
  fail(error)
  const keepQ = new Set(questions.map((q) => q.id))
  const removedQ = (existing ?? []).filter((q) => !keepQ.has(q.id)).map((q) => q.id)
  if (removedQ.length) fail((await supabase.from('questions').delete().in('id', removedQ)).error)

  if (questions.length) fail((await supabase.from('questions').upsert(questions.map((q, i) => ({
    id: q.id, quiz_id: quizId, position: i + 1, kind: q.kind, prompt: q.prompt, media_url: q.media_url || null,
    time_limit_s: q.time_limit_s, points_multiplier: q.points_multiplier,
  })))).error)

  const keepO = new Set(questions.flatMap((q) => q.options.map((o) => o.id)))
  const removedO = (existing ?? []).filter((q) => keepQ.has(q.id))
    .flatMap((q) => (q.options as { id: string }[]).map((o) => o.id)).filter((id) => !keepO.has(id))
  if (removedO.length) fail((await supabase.from('options').delete().in('id', removedO)).error)

  const rows = questions.flatMap((q) => q.options.map((o, i) => ({ id: o.id, question_id: q.id, position: i, label: o.label, is_correct: o.is_correct })))
  if (rows.length) fail((await supabase.from('options').upsert(rows)).error)
}
