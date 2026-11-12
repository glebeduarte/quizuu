import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { channelFor, randomPin } from '../lib/game'
import { limiteMsg } from '../lib/plan'
import AppShell from '../lib/AppShell'

type Partida = { id: string; pin?: string; created_at: string; finished_at: string | null; status: string; quiz_id: string; quizzes: { title: string } | null; players: { count: number }[] }
type Quiz = { id: string; title: string; updated_at: string; questions: { count: number }[] }
type Poll = { id: string; title: string; code: string; updated_at: string; poll_questions: { count: number }[]; poll_votes: { count: number }[] }

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
const TRASH = 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'
const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
const fmtHora = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const jog = (p: Partida) => p.players[0]?.count ?? 0

export default function Painel() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { secao = 'inicio' } = useParams()
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null)
  const [partidas, setPartidas] = useState<Partida[] | null>(null)
  const [polls, setPolls] = useState<Poll[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [encerrarId, setEncerrarId] = useState<string | null>(null)
  const [encerrando, setEncerrando] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'recentes' | 'nome' | 'jogados'>('recentes')
  const [filtroRel, setFiltroRel] = useState<'todas' | 'finalizadas' | 'andamento'>('todas')

  useEffect(() => {
    supabase.from('quizzes').select('id,title,updated_at,questions(count)').order('updated_at', { ascending: false })
      .then(({ data }) => setQuizzes((data as Quiz[]) ?? []))
    supabase.from('sessions').select('id,pin,created_at,finished_at,status,quiz_id,quizzes(title),players(count)').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setPartidas(((data ?? []) as unknown as Partida[]).filter((p) => p.status !== 'lobby' || jog(p) > 0)))
    supabase.from('polls').select('id,title,code,updated_at,poll_questions(count),poll_votes(count)').order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) { setPolls((data as Poll[]) ?? []); return }
        supabase.from('polls').select('id,title,code,updated_at,poll_questions(count)').order('updated_at', { ascending: false })
          .then(({ data }) => setPolls(((data ?? []) as Poll[]).map((p) => ({ ...p, poll_votes: [{ count: 0 }] }))))
      })
  }, [])
  useEffect(() => { setError(''); setConfirmId(null) }, [secao])

  const jogadasPorQuiz = useMemo(() => {
    const m = new Map<string, { vezes: number; jogadores: number; ultima: string }>()
    ;(partidas ?? []).forEach((p) => {
      const x = m.get(p.quiz_id) ?? { vezes: 0, jogadores: 0, ultima: p.created_at }
      m.set(p.quiz_id, { vezes: x.vezes + 1, jogadores: x.jogadores + jog(p), ultima: x.ultima > p.created_at ? x.ultima : p.created_at })
    })
    return m
  }, [partidas])

  async function novo() {
    setCreating(true); setError('')
    const { data, error } = await supabase.from('quizzes').insert({ owner_id: session!.user.id, title: 'Quiz sem título' }).select('id').single()
    if (error || !data) { setError(limiteMsg(error) ?? 'Não foi possível criar o quiz. Tente de novo.'); setCreating(false); return }
    navigate(`/quiz/${data.id}`)
  }

  async function jogar(quizId: string) {
    setError('')
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabase.from('sessions').insert({ quiz_id: quizId, host_id: session!.user.id, pin: randomPin() }).select('id').single()
      if (data) { navigate(`/host/${data.id}`); return }
      if (error && error.code !== '23505') break
    }
    setError('Não foi possível abrir a sala. Tente de novo.')
  }

  async function excluir(id: string) {
    setDeleting(true); setError('')
    const { error } = await supabase.from('quizzes').delete().eq('id', id)
    setDeleting(false); setConfirmId(null)
    if (error) { setError('Não foi possível excluir o quiz. Tente de novo.'); return }
    setQuizzes((qs) => (qs ?? []).filter((q) => q.id !== id))
    setPartidas((ps) => (ps ?? []).filter((p) => p.quiz_id !== id))
  }

  const lista = useMemo(() => {
    const l = (quizzes ?? []).filter((q) => q.title.toLowerCase().includes(busca.toLowerCase()))
    if (ordem === 'nome') return [...l].sort((a, b) => a.title.localeCompare(b.title))
    if (ordem === 'jogados') return [...l].sort((a, b) => (jogadasPorQuiz.get(b.id)?.vezes ?? 0) - (jogadasPorQuiz.get(a.id)?.vezes ?? 0))
    return l
  }, [quizzes, busca, ordem, jogadasPorQuiz])

  const finalizadas = (partidas ?? []).filter((p) => p.status === 'finished')
  const totalJogadores = (partidas ?? []).reduce((a, p) => a + jog(p), 0)
  const totalVotos = polls.reduce((a, p) => a + (p.poll_votes?.[0]?.count ?? 0), 0)
  const relatorios = (partidas ?? []).filter((p) => filtroRel === 'todas' || (filtroRel === 'finalizadas' ? p.status === 'finished' : p.status !== 'finished'))
  const nome = session?.user.email?.split('@')[0] ?? ''

  const novoQuizBtn = <button className="qz-btn qz-btn--primary" onClick={novo} disabled={creating}>{creating ? 'Criando…' : 'Novo quiz'}</button>
  const erroBox = error && <p className="notice notice--err">{error} {error.includes('limite') && <Link to="/plano">Ver planos</Link>}</p>

  function QuizCard({ q }: { q: Quiz }) {
    const j = jogadasPorQuiz.get(q.id)
    const n = q.questions[0]?.count ?? 0
    return (
      <div className="card quiz-card p-quiz">
        <Link to={`/quiz/${q.id}`} className="quiz-card__link"><h3>{q.title}</h3></Link>
        <div className="p-meta">
          <span>{n} {n === 1 ? 'pergunta' : 'perguntas'}</span>
          <span>{j ? `jogado ${j.vezes}x · ${j.jogadores} jogadores` : 'ainda não jogado'}</span>
          <span>editado em {fmt(q.updated_at)}</span>
        </div>
        {confirmId === q.id ? (
          <div className="confirm-box" role="alert">
            <p>Excluir “{q.title}”? As partidas e relatórios deste quiz também serão apagados.</p>
            <div className="btn-row">
              <button className="qz-btn qz-btn--secondary" onClick={() => setConfirmId(null)} disabled={deleting}>Cancelar</button>
              <button className="qz-btn qz-btn--danger" onClick={() => excluir(q.id)} disabled={deleting}>{deleting ? 'Excluindo…' : 'Excluir quiz'}</button>
            </div>
          </div>
        ) : (
          <div className="btn-row">
            <button className="qz-btn qz-btn--primary" disabled={!n} title={!n ? 'Adicione perguntas para jogar' : undefined} onClick={() => jogar(q.id)}>Jogar</button>
            <Link to={`/quiz/${q.id}`} className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Editar</Link>
            <button className="qz-btn qz-btn--ghost icon-btn" aria-label={`Excluir ${q.title}`} title="Excluir quiz" onClick={() => setConfirmId(q.id)}><Icon d={TRASH} /></button>
          </div>
        )}
      </div>
    )
  }

  // encerra uma partida que ficou aberta: grava como finalizada e manda os celulares para o pódio
  async function encerrarPartida(id: string) {
    setEncerrando(true)
    const agora = new Date().toISOString()
    const { error: e } = await supabase.from('sessions').update({ status: 'finished', finished_at: agora }).eq('id', id)
    if (e) { setEncerrando(false); setError('Não foi possível encerrar a partida. Tente de novo.'); return }
    const ch = channelFor(id)
    await new Promise<void>((ok) => {
      const t = setTimeout(ok, 3000)
      ch.subscribe((st) => { if (st === 'SUBSCRIBED') { ch.send({ type: 'broadcast', event: 'state', payload: { phase: 'podium' } }).finally(() => { clearTimeout(t); ok() }) } })
    })
    supabase.removeChannel(ch)
    setPartidas((ps) => (ps ?? []).map((x) => (x.id === id ? { ...x, status: 'finished', finished_at: agora } : x)))
    setEncerrando(false); setEncerrarId(null)
  }

  function LinhaPartida({ p }: { p: Partida }) {
    const fim = p.status === 'finished'
    if (encerrarId === p.id) return (
      <div className="match-row">
        <div className="confirm-box" role="alert" style={{ width: '100%' }}>
          <p>Encerrar a partida de “{p.quizzes?.title ?? 'Quiz excluído'}”? As perguntas que faltam não serão jogadas e o relatório fica com a pontuação atual.</p>
          <div className="btn-row">
            <button className="qz-btn qz-btn--secondary" onClick={() => setEncerrarId(null)} disabled={encerrando}>Cancelar</button>
            <button className="qz-btn qz-btn--danger" onClick={() => encerrarPartida(p.id)} disabled={encerrando}>{encerrando ? 'Encerrando…' : 'Encerrar partida'}</button>
          </div>
        </div>
      </div>
    )
    return (
      <div className="match-row">
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <strong>{p.quizzes?.title ?? 'Quiz excluído'}</strong>
          <span className="muted" style={{ fontSize: 14 }}>{fmtHora(p.created_at)} · {jog(p)} {jog(p) === 1 ? 'jogador' : 'jogadores'}</span>
        </div>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <span className={`p-status${fim ? ' ok' : ''}`}>{fim ? 'Finalizada' : 'Em andamento'}</span>
          {fim ? <Link to={`/relatorio/${p.id}`} className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Ver relatório</Link>
               : <>
                   <Link to={`/host/${p.id}`} className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Retomar</Link>
                   <button className="qz-btn qz-btn--ghost" onClick={() => setEncerrarId(p.id)}>Encerrar</button>
                 </>}
        </div>
      </div>
    )
  }

  if (secao === 'quizzes') return (
    <AppShell title="Meus quizzes" actions={<><Link to="/gerar" className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Gerar com IA</Link>{novoQuizBtn}</>}>
      {erroBox}
      <div className="adm-toolbar">
        <label className="sr-only" htmlFor="bq">Buscar quiz</label>
        <input id="bq" className="input" placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="sr-only" htmlFor="oq">Ordenar</label>
        <select id="oq" className="input" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          <option value="recentes">Editados recentemente</option>
          <option value="jogados">Mais jogados</option>
          <option value="nome">Nome (A a Z)</option>
        </select>
      </div>
      {quizzes === null ? <p className="muted">Carregando…</p> : quizzes.length === 0 ? (
        <div className="card empty">
          <h2 style={{ fontSize: 22 }}>Nenhum quiz ainda</h2>
          <p className="muted" style={{ margin: 0, maxWidth: '40ch' }}>Crie seu primeiro quiz à mão ou peça para a IA montar a partir de um tema.</p>
          <div className="btn-row">{novoQuizBtn}<Link to="/gerar" className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Gerar com IA</Link></div>
        </div>
      ) : lista.length === 0 ? <p className="muted">Nenhum quiz com esse nome.</p> : (
        <div className="quiz-grid">{lista.map((q) => <QuizCard key={q.id} q={q} />)}</div>
      )}
    </AppShell>
  )

  if (secao === 'relatorios') return (
    <AppShell title="Relatórios">
      <div className="kpis">
        <div className="kpi"><strong>{(partidas ?? []).length}</strong><span>partidas</span></div>
        <div className="kpi"><strong>{finalizadas.length}</strong><span>chegaram ao pódio</span></div>
        <div className="kpi"><strong>{totalJogadores}</strong><span>jogadores no total</span></div>
        <div className="kpi"><strong>{(partidas ?? []).length ? Math.round(totalJogadores / (partidas ?? []).length) : 0}</strong><span>jogadores por partida, em média</span></div>
      </div>
      <div className="admin-chips">
        {(['todas', 'finalizadas', 'andamento'] as const).map((f) => (
          <button key={f} className={filtroRel === f ? 'on' : ''} onClick={() => setFiltroRel(f)}>{{ todas: 'Todas', finalizadas: 'Finalizadas', andamento: 'Em andamento' }[f]}</button>
        ))}
      </div>
      {partidas === null ? <p className="muted">Carregando…</p> : relatorios.length === 0 ? (
        <div className="card empty">
          <h2 style={{ fontSize: 22 }}>Nenhuma partida aqui</h2>
          <p className="muted" style={{ margin: 0, maxWidth: '44ch' }}>Quando você jogar um quiz até o pódio, o relatório aparece aqui com acertos por pergunta, ranking e planilha para baixar.</p>
        </div>
      ) : <div className="card" style={{ padding: 0 }}>{relatorios.map((p) => <LinhaPartida key={p.id} p={p} />)}</div>}
    </AppShell>
  )

  // Início
  const SH = [
    ['var(--answer-red)', 'var(--answer-orange)', 'var(--answer-yellow)', 'var(--answer-purple)'],
    ['var(--answer-purple)', 'var(--answer-yellow)', 'var(--answer-orange)', 'var(--answer-red)'],
    ['var(--answer-yellow)', 'var(--answer-red)', 'var(--answer-purple)', 'var(--answer-orange)'],
    ['var(--answer-orange)', 'var(--answer-purple)', 'var(--answer-red)', 'var(--answer-yellow)'],
  ]
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const aberta = (partidas ?? []).find((p) => p.status !== 'finished')
  const rascunhos = (quizzes ?? []).filter((q) => !(q.questions[0]?.count)).length
  const [aba, setAba] = [ordem, setOrdem]
  const recentes = aba === 'jogados' ? lista.slice(0, 5) : (quizzes ?? []).filter((q) => aba !== 'nome' || !q.questions[0]?.count).slice(0, 5)
  const pinFmt = (p?: string) => p ? `${p.slice(0, 3)} ${p.slice(3)}` : ''

  return (
    <AppShell title="Início" actions={novoQuizBtn}>
      {erroBox}
      <section className="pi-hello">
        <div>
          <h2>{saudacao}{nome ? `, ${nome}` : ''}!</h2>
          <p>{aberta ? 'Você tem uma sala aberta' : 'Nenhuma sala aberta agora'}{rascunhos ? ` e ${rascunhos} ${rascunhos === 1 ? 'rascunho esperando' : 'rascunhos esperando'}` : ''}.</p>
        </div>
      </section>

      <section className="pi-acoes">
        <button className="pi-acao" onClick={novo} disabled={creating}>
          <span className="pi-ico" style={{ background: 'var(--answer-orange)' }}><svg viewBox="0 0 24 24"><path d="M12 2 22 12 12 22 2 12z" /></svg></span>
          <h3>Quiz do zero</h3><p>Monte as perguntas, defina o tempo e jogue ao vivo com o PIN.</p>
          <span className="pi-go" style={{ color: 'var(--answer-orange)' }}>{creating ? 'Criando…' : 'Começar →'}</span>
        </button>
        <Link to="/gerar" className="pi-acao">
          <span className="pi-ico" style={{ background: 'var(--answer-purple)' }}><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg></span>
          <h3>Gerar com IA</h3><p>Envie um PDF ou escreva o tema e a IA monta as perguntas.</p>
          <span className="pi-go" style={{ color: 'var(--answer-purple)' }}>Gerar →</span>
        </Link>
        <Link to="/votacoes" className="pi-acao">
          <span className="pi-ico" style={{ background: 'var(--answer-yellow)', color: '#22103a' }}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg></span>
          <h3>Votação ao vivo</h3><p>Enquete, nuvem de palavras e escala, com resultado no telão.</p>
          <span className="pi-go" style={{ color: '#a87400' }}>Criar →</span>
        </Link>
      </section>

      <section className="pi-stats">
        <div className="pi-stat"><i className="pi-dot pi-dot--tri" /><strong>{partidas?.length ?? '…'}</strong><span>partidas jogadas</span></div>
        <div className="pi-stat"><i className="pi-dot pi-dot--dia" /><strong>{totalJogadores.toLocaleString('pt-BR')}</strong><span>jogadores no total</span></div>
        <div className="pi-stat"><i className="pi-dot pi-dot--cir" /><strong>{quizzes?.length ?? '…'}</strong><span>quizzes criados</span></div>
        <div className="pi-stat"><i className="pi-dot pi-dot--sq" /><strong>{polls.length}</strong><span>votações · {totalVotos} votos</span></div>
      </section>

      <section className="pi-row">
        <div className="pi-panel">
          <div className="pi-panel__head">
            <h2>Seus quizzes</h2>
            <div className="pi-chips">
              {([['recentes', 'Recentes'], ['nome', 'Rascunhos'], ['jogados', 'Mais jogados']] as const).map(([k, l]) => (
                <button key={k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{l}</button>
              ))}
            </div>
          </div>
          {quizzes && recentes.length === 0 && <p className="muted">Nada por aqui ainda.</p>}
          {recentes.map((q, i) => {
            const n = q.questions[0]?.count ?? 0
            const ao = aberta?.quiz_id === q.id
            return (
              <div className="pi-quiz" key={q.id}>
                <div className="pi-thumb">{SH[i % 4].map((c, k) => <b key={k} style={{ background: c }} />)}</div>
                <Link to={`/quiz/${q.id}`} className="pi-quiz__txt"><h4>{q.title}</h4><small>{n} {n === 1 ? 'pergunta' : 'perguntas'} · editado em {fmt(q.updated_at)}</small></Link>
                <span className={`pi-tag ${ao ? 'live' : n ? 'ok' : 'draft'}`}>{ao ? 'Ao vivo' : n ? 'Pronto' : 'Rascunho'}</span>
                {n ? <button className="pi-btn sm" onClick={() => jogar(q.id)}>Jogar</button>
                   : <Link to={`/quiz/${q.id}`} className="pi-btn ghost sm">Editar</Link>}
              </div>
            )
          })}
          <Link to="/painel/quizzes" className="pi-vertodos">Ver todos os quizzes →</Link>
        </div>

        <div className="pi-sala">
          {aberta ? (<>
            <h2>Sala aberta</h2>
            <p>{aberta.quizzes?.title ?? 'Quiz'}</p>
            <div className="pi-sala__label">PIN do jogo</div>
            <div className="pi-pin">{pinFmt(aberta.pin)}</div>
            <p className="pi-sala__n">{jog(aberta)} {jog(aberta) === 1 ? 'jogador' : 'jogadores'} na sala</p>
            <Link to={`/host/${aberta.id}`} className="pi-btn full">Abrir telão e continuar</Link>
          </>) : (<>
            <h2>Nenhuma sala aberta</h2>
            <p>Escolha um quiz pronto e abra a sala. O PIN aparece aqui e no telão.</p>
            <div className="pi-pin pi-pin--vazio">· · ·</div>
            {(quizzes ?? []).find((q) => q.questions[0]?.count)
              ? <button className="pi-btn full" onClick={() => jogar((quizzes ?? []).find((q) => q.questions[0]?.count)!.id)}>Jogar o último quiz</button>
              : <button className="pi-btn full" onClick={novo}>Criar um quiz</button>}
          </>)}
        </div>
      </section>
    </AppShell>
  )
}
