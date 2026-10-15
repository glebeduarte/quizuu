import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { randomPin } from '../lib/game'
import { limiteMsg } from '../lib/plan'
import AppShell from '../lib/AppShell'

type Partida = { id: string; created_at: string; finished_at: string | null; status: string; quiz_id: string; quizzes: { title: string } | null; players: { count: number }[] }
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
  const [deleting, setDeleting] = useState(false)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'recentes' | 'nome' | 'jogados'>('recentes')
  const [filtroRel, setFiltroRel] = useState<'todas' | 'finalizadas' | 'andamento'>('todas')

  useEffect(() => {
    supabase.from('quizzes').select('id,title,updated_at,questions(count)').order('updated_at', { ascending: false })
      .then(({ data }) => setQuizzes((data as Quiz[]) ?? []))
    supabase.from('sessions').select('id,created_at,finished_at,status,quiz_id,quizzes(title),players(count)').order('created_at', { ascending: false }).limit(200)
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

  function LinhaPartida({ p }: { p: Partida }) {
    const fim = p.status === 'finished'
    return (
      <div className="match-row">
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <strong>{p.quizzes?.title ?? 'Quiz excluído'}</strong>
          <span className="muted" style={{ fontSize: 14 }}>{fmtHora(p.created_at)} · {jog(p)} {jog(p) === 1 ? 'jogador' : 'jogadores'}</span>
        </div>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <span className={`p-status${fim ? ' ok' : ''}`}>{fim ? 'Finalizada' : 'Em andamento'}</span>
          {fim ? <Link to={`/relatorio/${p.id}`} className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Ver relatório</Link>
               : <Link to={`/host/${p.id}`} className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Retomar</Link>}
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
  return (
    <AppShell title="Início" actions={novoQuizBtn}>
      {erroBox}
      <div className="p-hello">
        <h2>Olá{nome ? `, ${nome}` : ''}.</h2>
        <p className="muted">O que vamos colocar no telão hoje?</p>
      </div>
      <div className="p-acoes">
        <button className="p-acao qz-answer--red" onClick={novo} disabled={creating}><Icon d="M12 5v14M5 12h14" /><strong>Novo quiz</strong><span>Monte as perguntas à mão</span></button>
        <Link to="/gerar" className="p-acao qz-answer--orange"><Icon d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><strong>Gerar com IA</strong><span>A partir de um tema ou material</span></Link>
        <Link to="/votacoes" className="p-acao qz-answer--yellow"><Icon d="M4 6h10M4 12h16M4 18h7" /><strong>Nova votação</strong><span>Enquete ou nuvem de palavras</span></Link>
        <Link to="/painel/relatorios" className="p-acao qz-answer--purple"><Icon d="M4 20V10M10 20V4M16 20v-7M22 20H2" /><strong>Relatórios</strong><span>Resultados das partidas</span></Link>
      </div>
      <div className="kpis">
        <div className="kpi"><strong>{quizzes?.length ?? '…'}</strong><span>quizzes</span></div>
        <div className="kpi"><strong>{partidas?.length ?? '…'}</strong><span>partidas jogadas</span></div>
        <div className="kpi"><strong>{totalJogadores}</strong><span>jogadores alcançados</span></div>
        <div className="kpi"><strong>{polls.length}</strong><span>votações · {totalVotos} votos</span></div>
      </div>
      <div className="adm-grid2">
        <div className="card adm-card">
          <div className="adm-card__head"><h2>Quizzes recentes</h2><Link to="/painel/quizzes">Ver todos</Link></div>
          {quizzes && quizzes.length === 0 && <p className="muted" style={{ margin: 0 }}>Nenhum quiz ainda.</p>}
          <ul className="adm-lista">
            {(quizzes ?? []).slice(0, 5).map((q) => (
              <li key={q.id}>
                <Link to={`/quiz/${q.id}`}>{q.title}</Link>
                <button className="qz-btn qz-btn--ghost p-mini" disabled={!q.questions[0]?.count} onClick={() => jogar(q.id)}>Jogar</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card adm-card">
          <div className="adm-card__head"><h2>Últimas partidas</h2><Link to="/painel/relatorios">Ver relatórios</Link></div>
          {partidas && partidas.length === 0 && <p className="muted" style={{ margin: 0 }}>Nenhuma partida ainda.</p>}
          <ul className="adm-lista">
            {(partidas ?? []).slice(0, 5).map((p) => (
              <li key={p.id}>
                <span>{p.quizzes?.title ?? 'Quiz excluído'} <em className="muted p-sub">{fmt(p.created_at)} · {jog(p)} jogadores</em></span>
                <Link to={p.status === 'finished' ? `/relatorio/${p.id}` : `/host/${p.id}`}>{p.status === 'finished' ? 'Relatório' : 'Retomar'}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="card adm-card">
          <div className="adm-card__head"><h2>Votações</h2><Link to="/votacoes">Ver todas</Link></div>
          {polls.length === 0 && <p className="muted" style={{ margin: 0 }}>Nenhuma votação ainda.</p>}
          <ul className="adm-lista">
            {polls.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link to={`/votacao/${p.id}`}>{p.title}</Link>
                <span className="muted">{p.poll_votes?.[0]?.count ?? 0} votos · {p.code}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  )
}
