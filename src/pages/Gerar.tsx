import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ANSWER, Shape } from '../lib/shapes'
import { saveQuiz } from '../lib/saveQuiz'
import { limiteMsg, PRECO } from '../lib/plan'

type Gerada = { enunciado: string; tipo: 'multiple_choice' | 'true_false'; opcoes: string[]; correta: number; tempo: number }

const ERROS: Record<string, string> = {
  ia_nao_configurada: 'A geração por IA ainda não foi ativada. Falta cadastrar a chave do Gemini no Supabase.',
  ia_bloqueada: 'A geração com IA não está liberada para a sua conta.',
  limite_mensal: 'Você usou todas as gerações com IA disponíveis. No plano Grátis são 3 no total; assine o Pro para ter 25 por mês.',
  sem_conteudo: 'Escreva um tema ou envie um material.',
  tipo_de_arquivo: 'Envie PDF, TXT, MD, PNG, JPG ou WEBP.',
  arquivo_grande: 'O arquivo precisa ter até 30 MB.',
  arquivo_nao_encontrado: 'O arquivo não chegou ao servidor. Envie de novo.',
  envio_falhou: 'Não foi possível enviar o arquivo. Verifique a conexão e tente de novo.',
  ia_ocupada: 'O Gemini está com muita demanda agora. Espere um minuto e tente de novo.',
  falha_ia: 'O Gemini não respondeu agora. Tente de novo em instantes.',
  resposta_invalida: 'A IA devolveu perguntas incompletas. Tente de novo ou ajuste o pedido.',
}
const ACEITOS = '.pdf,.txt,.md,.png,.jpg,.jpeg,.webp'


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
  const [etapa, setEtapa] = useState('')
  const [erro, setErro] = useState('')
  const [titulo, setTitulo] = useState('')
  const [perguntas, setPerguntas] = useState<Gerada[] | null>(null)
  const [fora, setFora] = useState<Set<number>>(new Set())
  const [restantes, setRestantes] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [acesso, setAcesso] = useState<{ enabled: boolean; limit: number; used: number; periodo?: string; plan?: string } | null>(null)
  useEffect(() => { supabase.rpc('my_ai_access').then(({ data }) => setAcesso(data ?? { enabled: false, limit: 0, used: 0 })) }, [])

  async function gerar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setBusy(true); setPerguntas(null); setFora(new Set())
    const body: Record<string, unknown> = { quantidade, nivel, tipo, tempo, publico }
    let uploaded = ''
    if (modo === 'tema') body.tema = tema
    else {
      if (tema) body.tema = tema
      if (material.trim()) body.material = material
      if (arquivo) {
        if (arquivo.size > 30 * 1024 * 1024) { setErro(ERROS.arquivo_grande); setBusy(false); return }
        const tipoArq = arquivo.type || (arquivo.name.endsWith('.md') ? 'text/markdown' : 'text/plain')
        const ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `${session!.user.id}/${crypto.randomUUID()}.${ext}`
        setEtapa('Enviando o arquivo…')
        const up = await supabase.storage.from('materiais').upload(path, arquivo, { contentType: tipoArq })
        if (up.error) { setErro(ERROS.envio_falhou); setBusy(false); setEtapa(''); return }
        uploaded = path
        body.arquivo = { nome: arquivo.name, tipo: tipoArq, path }
      }
    }
    setEtapa(uploaded ? 'Lendo o material e montando as perguntas…' : 'Montando as perguntas…')
    const { data, error } = await supabase.functions.invoke('gerar-quiz', { body })
    setBusy(false); setEtapa('')
    if (error && uploaded) supabase.storage.from('materiais').remove([uploaded])
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
    if (error || !quiz) { setErro(limiteMsg(error) ?? 'Não foi possível criar o quiz.'); setSalvando(false); return }
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

        {acesso === null ? <p className="muted">Carregando…</p> : (!acesso.enabled || (acesso.periodo === 'total' && acesso.used >= acesso.limit)) ? (
          <div className="card gen-lock">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            <h2>{acesso.periodo === 'total' ? 'Você usou as 3 gerações grátis' : 'Recurso do plano Pro'}</h2>
            <p className="muted">Com o Pro você gera até 25 quizzes por mês com IA, a partir de um tema ou de um material seu, e cria até 50 quizzes e 50 votações. No plano Grátis você segue criando quizzes à mão.</p>
            <Link className="qz-btn qz-btn--primary" to="/plano" style={{ textDecoration: 'none' }}>Assinar o Pro por {PRECO}/mês</Link>
          </div>
        ) : <>
        {acesso.periodo === 'total'
          ? <p className="notice notice--ok" style={{ margin: 0 }}>No plano Grátis você tem {acesso.limit} gerações com IA para experimentar. Usadas: {acesso.used} de {acesso.limit}. <Link to="/plano">Com o Pro são 25 por mês.</Link></p>
          : <p className="muted" style={{ margin: 0 }}>Gerações usadas este mês: {acesso.used} de {acesso.limit}.</p>}
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
                  {arquivo ? <span><strong>{arquivo.name}</strong> · {(arquivo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</span> : 'PDF, texto ou imagem, até 30 MB'}
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
            <p>{etapa || 'Montando as perguntas…'} Arquivos grandes podem levar até um minuto.</p>
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
            <p className="muted" style={{ margin: 0 }}>Toque numa pergunta para deixá-la de fora. Depois você ainda pode editar tudo.{restantes !== null && ` Gerações restantes: ${restantes}.`}</p>
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
        </>}
      </main>
    </div>
  )
}
