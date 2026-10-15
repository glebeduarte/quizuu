import { supabase } from './supabase'

type Opt = { id: string; label: string; is_correct: boolean }
type Q = { id: string; kind: string; prompt: string; media_url: string; time_limit_s: number; points_multiplier: number; options: Opt[] }

// Salva o quiz inteiro usando as regras de acesso de cada tabela.
// As posições passam por valores negativos para poder reordenar sem conflito.
export async function saveQuiz(quizId: string, title: string, questions: Q[]) {
  const fail = (e: unknown) => { if (e) throw e }

  fail((await supabase.from('quizzes').update({ title, updated_at: new Date().toISOString() }).eq('id', quizId)).error)

  const { data: existing, error } = await supabase.from('questions').select('id, position').eq('quiz_id', quizId)
  fail(error)
  const keep = new Set(questions.map((q) => q.id))
  const removed = (existing ?? []).filter((q) => !keep.has(q.id)).map((q) => q.id)
  if (removed.length) fail((await supabase.from('questions').delete().in('id', removed)).error)

  const kept = (existing ?? []).filter((q) => keep.has(q.id))
  await Promise.all(kept.map((q) => supabase.from('questions').update({ position: -1000 - q.position }).eq('id', q.id).then((r) => fail(r.error))))

  fail((await supabase.from('questions').upsert(questions.map((q, i) => ({
    id: q.id, quiz_id: quizId, position: i + 1, kind: q.kind, prompt: q.prompt, media_url: q.media_url || null,
    time_limit_s: q.time_limit_s, points_multiplier: q.points_multiplier,
  })))).error)

  // respostas: apaga as das perguntas existentes e regrava na ordem nova (posições 0 a 3)
  if (kept.length) fail((await supabase.from('options').delete().in('question_id', kept.map((q) => q.id))).error)

  const rows = questions.flatMap((q) => q.options.map((o, i) => ({ id: o.id, question_id: q.id, position: i, label: o.label, is_correct: o.is_correct })))
  if (rows.length) fail((await supabase.from('options').insert(rows)).error)
}
