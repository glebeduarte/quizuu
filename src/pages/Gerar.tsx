import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ANSWER, Shape } from '../lib/shapes'
import { saveQuiz } from '../lib/saveQuiz'

type Gerada = { enunciado: string; tipo: 'multiple_choice' | 'true_false'; opcoes: string[]; correta: number; tempo: number }

const ERROS: Record<string, string> = {
  ia_nao_configurada: 'A geração por IA ainda não foi ativada. Falta cadastrar a chave do Gemini no Supabase.',
  limite_diario: 'Você chegou ao limite de 20 gerações nas últimas 24 horas. Tente de novo amanhã.',
  sem_conteudo: 'Escreva um tema ou envie um material.',
  tipo_de_arquivo: 'Envie PDF, TXT, MD, PNG, JPG ou WEBP.',
  arquivo_grande: 'O arquivo precisa ter até 8 MB.',
  falha_ia: 'O Gemini não respondeu agora. Tente de novo em instantes.',
  resposta_invalida: 'A IA devolveu perguntas incompletas. Tente de novo ou ajuste o pedido.',
}
const ACEITOS = '.pdf,.txt,.md,.png,.jpg,.jpeg,.webp'

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(f)
})

export default function Gerar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [modo, setModo] = useState<'tema' | 'material'>('tema')
  const [tema, setTema] = useState('')
  const [material, setMaterial] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [quantidade, setQuantidade] = useState(10)
  const [nivel, setNivel] = useState('médio')
  const [tipo, setTipo] = useState('multiple_choice')
  const [tempo, setTempo] = useState(20)
  const [publico, setPublico] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [titulo, setTitulo] = useState('')
  const [perguntas, setPerguntas] = useState<Gerada[] | null>(null)
  const [fora, setFora] = useState<Set<number>>(new Set())
  const [restantes, setRestantes] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function gerar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setBusy(true); setPerguntas(null); setFora(new Set())
    const body: Record<string, unknown> = { quantidade, nivel, tipo, tempo, publico }
    if (modo === 'tema') body.tema = tema
    else {
      if (tema) body.tema = tema
      if (material.trim()) body.material = material
      if (arquivo) {
        if (arquivo.size > 8 * 1024 * 1024) { setErro(ERROS.arquivo_grande); setBusy(false); return }
        const tipoArq = arquivo.type || (arquivo.name.endsWith('.md') ? 'text/markdown' : 'text/plain')
        body.arquivo = { nome: arquivo.name, tipo: tipoArq, base64: await toBase64(arquivo) }
      }
    }
    const { data, error } = await supabase.functions.invoke('gerar-quiz', { body })
    setBusy(false)
    if (error) {
      let code = ''
      try { code = (await (error as { context?: Response }).context?.json())?.erro ?? '' } catch { /* sem corpo */ }
      setErro(ERROS[code] ?? 'Não foi possível gerar agora. Tente de novo.'); return
    }
    setTitulo(data.titulo); setPerguntas(data.perguntas); setRestantes(data.restantes)
  }

  async function criar() {
    if (!perguntas) return
    setSalvando(true); setErro('')
    const escolhidas = perguntas.filter((_, i) => !fora.has(i))
    const { data: quiz, error } = await supabase.from('quizzes').insert({ owner_id: session!.user.id, title: titulo || 'Quiz gerado' }).select('id').single()
    if (error || !quiz) { setErro('Não foi possível criar o quiz.'); setSalvando(false); return }
    try {
      await saveQuiz(quiz.id, titulo || 'Quiz gerado', escolhidas.map((p) => ({
        id: crypto.randomUUID(), kind: p.tipo, prompt: p.enunciado, media_url: '', time_limit_s: p.tempo, points_multiplier: 1,
        options: p.opcoes.map((o, k) => ({ id: crypto.randomUUID(), label: o, is_correct: k === p.correta })),
      })))
      navigate(`/quiz/${quiz.id}`)
    } catch { setErro('O quiz foi criado, mas as perguntas não salvaram. Abra pelo painel e tente de novo.'); setSalvando(false) }
  }

  const prontoParaGerar = modo === 'tema' ? tema.trim().length > 2 : !!(material.trim() || arquivo)

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/painel" className="qz-btn qz-btn--ghost" style={{ paddingLeft: 0 }}>← Meus quizzes</Link>
      </header>
      <main className="content gen">
        <div className="gen-head">
          <span className="eyebrow">Gerar com IA</span>
          <h1>Crie um quiz a partir de um tema ou de um material</h1>
          <p className="muted">O Gemini sugere as perguntas. Você revisa, tira o que não serve e ajusta tudo no editor antes de jogar.</p>
        </div>

        <form className="card gen-form" onSubmit={gerar}>
          <div className="seg" role="tablist" aria-label="Origem das perguntas">
            <button type="button" role="tab" aria-selected={modo === 'tema'} className={modo === 'tema' ? 'on' : ''} onClick={() => setModo('tema')}>Por tema</button>
            <button type="button" role="tab" aria-selected={modo === 'material'} className={modo === 'material' ? 'on' : ''} onClick={() => setModo('material')}>Por material</button>
          </div>

          {modo === 'tema' ? (
            <div className="field">
              <label htmlFor="tema">Tema</label>
              <input id="tema" className="input" maxLength={300} value={tema} onChange={(e) => setTema(e.target.value)}
                placeholder="Ex.: Sistema solar para o 6º ano" autoFocus />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="mat">Cole o texto do material</label>
                <textarea id="mat" className="input textarea" rows={6} maxLength={30000} value={material} onChange={(e) => setMaterial(e.target.value)}
                  placeholder="Cole aqui um resumo, capítulo, roteiro de aula ou transcrição de palestra." />
                <span className="muted" style={{ fontSize: 13, justifySelf: 'end' }}>{material.length.toLocaleString('pt-BR')}/30.000</span>
              </div>
              <div className="field">
                <label>Ou envie um arquivo</label>
                <label className="dropzone">
                  <input type="file" accept={ACEITOS} hidden onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); e.target.value = '' }} />
                  {arquivo ? <span><strong>{arquivo.name}</strong> · {(arquivo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</span> : 'PDF, texto ou imagem, até 8 MB'}
                </label>
                {arquivo && <button type="button" className="qz-btn qz-btn--ghost" style={{ justifySelf: 'start', minHeight: 0, padding: 0 }} onClick={() => setArquivo(null)}>Remover arquivo</button>}
              </div>
              <div className="field">
                <label htmlFor="foco">Foco (opcional)</label>
                <input id="foco" className="input" maxLength={300} value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: só o capítulo 3, datas importantes" />
              </div>
            </>
          )}

          <div className="gen-opts">
            <div className="field">
              <label htmlFor="qtd">Perguntas: {quantidade}</label>
              <input id="qtd" type="range" min={3} max={20} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="nivel">Nível</label>
              <select id="nivel" className="input" value={nivel} onChange={(e) => setNivel(e.target.value)}>
                <option value="fácil">Fácil</option><option value="médio">Médio</option><option value="difícil">Difícil</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="tipo">Tipo</label>
              <select id="tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="multiple_choice">Múltipla escolha</option><option value="true_false">Verdadeiro ou falso</option><option value="misto">Misto</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="tempo">Tempo por pergunta</label>
              <select id="tempo" className="input" value={tempo} onChange={(e) => setTempo(Number(e.target.value))}>
                {[10, 20, 30, 60].map((t) => <option key={t} value={t}>{t} segundos</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="publico">Público (opcional)</label>
            <input id="publico" className="input" maxLength={120} value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ex.: alunos do ensino médio, participantes de um congresso de saúde" />
          </div>

          {erro && <p className="notice notice--err" style={{ margin: 0 }}>{erro}</p>}
          <button className="qz-btn qz-btn--primary qz-btn--lg" disabled={busy || !prontoParaGerar}>{busy ? 'Gerando…' : perguntas ? 'Gerar de novo' : 'Gerar perguntas'}</button>
        </form>

        {busy && (
          <div className="gen-loading" aria-live="polite">
            <div className="gen-shapes">{ANSWER.map((a, k) => <span key={a.key} className={`qz-answer--${a.key}`} style={{ animationDelay: `${k * 120}ms` }}><Shape index={k} /></span>)}</div>
            <p>Montando as perguntas. Isso leva alguns segundos.</p>
          </div>
        )}

        {perguntas && !busy && (
          <section className="gen-result">
            <div className="gen-result-head">
              <div className="field" style={{ flex: 1, minWidth: 220 }}>
                <label htmlFor="titulo">Título do quiz</label>
                <input id="titulo" className="input" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
              </div>
              <button className="qz-btn qz-btn--primary qz-btn--lg" onClick={criar} disabled={salvando || fora.size === perguntas.length}>
                {salvando ? 'Criando…' : `Criar quiz com ${perguntas.length - fora.size} perguntas`}
              </button>
            </div>
            <p className="muted" style={{ margin: 0 }}>Toque numa pergunta para deixá-la de fora. Depois você ainda pode editar tudo.{restantes !== null && ` Gerações restantes hoje: ${restantes}.`}</p>
            <ol className="gen-list">
              {perguntas.map((p, i) => (
                <li key={i} className={`gen-q${fora.has(i) ? ' off' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
                  <button type="button" className="gen-q-btn" aria-pressed={!fora.has(i)}
                    onClick={() => setFora((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })}>
                    <span className="q-num">{i + 1}</span>
                    <span className="gen-q-body">
                      <strong>{p.enunciado}</strong>
                      <span className="gen-opts-list">
                        {p.opcoes.map((o, k) => (
                          <span key={k} className={`gen-opt${k === p.correta ? ' ok' : ''}`}>
                            <span className={`rq-shape qz-answer--${ANSWER[k].key}`}><Shape index={k} /></span>{o}{k === p.correta && ' ✓'}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="gen-toggle">{fora.has(i) ? 'Fora' : 'Incluída'}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  )
}
