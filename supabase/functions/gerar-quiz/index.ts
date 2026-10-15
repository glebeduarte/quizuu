// Quizuu · gera perguntas com o Gemini a partir de um tema ou de um material enviado.
// Segredos necessários no Supabase: GEMINI_API_KEY. Opcional: GEMINI_MODEL.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const DAILY_LIMIT = 20
const MAX_FILE_BYTES = 8 * 1024 * 1024
const FILE_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg', 'image/webp']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Input = {
  tema?: string; material?: string; arquivo?: { nome: string; tipo: string; base64: string }
  quantidade?: number; nivel?: string; publico?: string; tempo?: number; tipo?: 'multiple_choice' | 'true_false' | 'misto'
}

const schema = {
  type: 'OBJECT',
  properties: {
    titulo: { type: 'STRING' },
    perguntas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          enunciado: { type: 'STRING' },
          tipo: { type: 'STRING', enum: ['multiple_choice', 'true_false'] },
          opcoes: { type: 'ARRAY', items: { type: 'STRING' } },
          correta: { type: 'INTEGER' },
        },
        required: ['enunciado', 'tipo', 'opcoes', 'correta'],
      },
    },
  },
  required: ['titulo', 'perguntas'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { erro: 'metodo' })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return reply(401, { erro: 'nao_autenticado' })

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return reply(503, { erro: 'ia_nao_configurada' })

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await supabase.from('ai_generations').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since)
  if ((count ?? 0) >= DAILY_LIMIT) return reply(429, { erro: 'limite_diario' })

  let input: Input
  try { input = await req.json() } catch { return reply(400, { erro: 'entrada_invalida' }) }
  const tema = (input.tema ?? '').trim().slice(0, 300)
  const material = (input.material ?? '').trim().slice(0, 30000)
  const arquivo = input.arquivo
  if (!tema && !material && !arquivo) return reply(400, { erro: 'sem_conteudo' })
  if (arquivo) {
    if (!FILE_TYPES.includes(arquivo.tipo)) return reply(400, { erro: 'tipo_de_arquivo' })
    if (arquivo.base64.length * 0.75 > MAX_FILE_BYTES) return reply(400, { erro: 'arquivo_grande' })
  }
  const quantidade = Math.min(20, Math.max(3, Math.round(input.quantidade ?? 10)))
  const nivel = ['fácil', 'médio', 'difícil'].includes(input.nivel ?? '') ? input.nivel : 'médio'
  const publico = (input.publico ?? '').trim().slice(0, 120)
  const tipo = input.tipo ?? 'multiple_choice'

  const instrucoes = [
    `Crie um quiz em português do Brasil com exatamente ${quantidade} perguntas, nível ${nivel}.`,
    publico && `Público: ${publico}.`,
    tema && `Tema: ${tema}.`,
    (material || arquivo) && 'Baseie todas as perguntas somente no material fornecido. Não invente fatos que não estejam nele.',
    tipo === 'multiple_choice' && 'Todas as perguntas devem ser de múltipla escolha com exatamente 4 opções.',
    tipo === 'true_false' && 'Todas as perguntas devem ser de verdadeiro ou falso, com as opções exatamente "Verdadeiro" e "Falso".',
    tipo === 'misto' && 'Use principalmente múltipla escolha com 4 opções e algumas de verdadeiro ou falso (opções "Verdadeiro" e "Falso").',
    'Regras: enunciado com no máximo 120 caracteres, para ser lido de longe num telão. Cada opção com no máximo 60 caracteres.',
    'Só uma opção correta, indicada pelo índice em "correta" (começando em 0). Varie a posição da opção correta.',
    'As opções erradas devem ser plausíveis. Evite "todas as anteriores" e "nenhuma das anteriores".',
    'O título do quiz deve ser curto, com no máximo 60 caracteres.',
  ].filter(Boolean).join('\n')

  const parts: Record<string, unknown>[] = [{ text: instrucoes }]
  if (material) parts.push({ text: `MATERIAL:\n${material}` })
  if (arquivo) parts.push({ inline_data: { mime_type: arquivo.tipo, data: arquivo.base64 } })

  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.7 },
    }),
  })
  if (!res.ok) {
    console.error('gemini', res.status, await res.text())
    return reply(502, { erro: 'falha_ia' })
  }
  const out = await res.json()
  const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  let quiz: { titulo: string; perguntas: { enunciado: string; tipo: string; opcoes: string[]; correta: number }[] }
  try { quiz = JSON.parse(text) } catch { return reply(502, { erro: 'resposta_invalida' }) }

  // Limpa e valida antes de devolver
  const tempo = [5, 10, 20, 30, 60, 90, 120].includes(input.tempo ?? 0) ? input.tempo : 20
  const perguntas = (quiz.perguntas ?? []).map((p) => {
    const tf = p.tipo === 'true_false'
    const opcoes = (tf ? ['Verdadeiro', 'Falso'] : (p.opcoes ?? []).slice(0, 4)).map((o) => String(o).trim().slice(0, 120))
    return { enunciado: String(p.enunciado ?? '').trim().slice(0, 300), tipo: tf ? 'true_false' : 'multiple_choice', opcoes, correta: Number(p.correta), tempo }
  }).filter((p) => p.enunciado && p.opcoes.length >= 2 && p.opcoes.every(Boolean) && p.correta >= 0 && p.correta < p.opcoes.length)

  if (!perguntas.length) return reply(502, { erro: 'resposta_invalida' })
  await supabase.from('ai_generations').insert({ user_id: user.id, source: material || arquivo ? 'material' : 'tema', questions: perguntas.length })
  return reply(200, { titulo: String(quiz.titulo ?? tema ?? 'Quiz').slice(0, 120), perguntas, restantes: DAILY_LIMIT - (count ?? 0) - 1 })
})
