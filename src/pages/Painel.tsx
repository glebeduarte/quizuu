import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { randomPin } from '../lib/game'

type Quiz = { id: string; title: string; updated_at: string; questions: { count: number }[] }

export default function Painel() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('quizzes').select('id,title,updated_at,questions(count)').order('updated_at', { ascending: false })
      .then(({ data }) => setQuizzes((data as Quiz[]) ?? []))
  }, [])

  async function novo() {
    setCreating(true); setError('')
    const { data, error } = await supabase.from('quizzes')
      .insert({ owner_id: session!.user.id, title: 'Quiz sem título' }).select('id').single()
    if (error || !data) { setError('Não foi possível criar o quiz. Tente de novo.'); setCreating(false); return }
    navigate(`/quiz/${data.id}`)
  }

  async function jogar(quizId: string) {
    setError('')
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabase.from('sessions')
        .insert({ quiz_id: quizId, host_id: session!.user.id, pin: randomPin() }).select('id').single()
      if (data) { navigate(`/host/${data.id}`); return }
      if (error && error.code !== '23505') break
    }
    setError('Não foi possível abrir a sala. Tente de novo.')
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="wordmark"><picture><source srcSet="/logo-wordmark-light.png" media="(prefers-color-scheme: dark)" /><img src="/logo-wordmark.png" alt="Quizuu" /></picture></Link>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 14 }}>{session?.user.email}</span>
          <button className="qz-btn qz-btn--ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <main className="content" style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 32 }}>Meus quizzes</h1>
          <button className="qz-btn qz-btn--primary" onClick={novo} disabled={creating}>{creating ? 'Criando…' : 'Novo quiz'}</button>
        </div>
        {error && <p className="notice notice--err">{error}</p>}
        {quizzes === null ? (
          <p className="muted">Carregando…</p>
        ) : quizzes.length === 0 ? (
          <div className="card empty">
            <h2 style={{ fontSize: 22 }}>Nenhum quiz ainda</h2>
            <p className="muted" style={{ margin: 0, maxWidth: '40ch' }}>Crie seu primeiro quiz. Depois é só abrir uma sala e projetar.</p>
          </div>
        ) : (
          <div className="quiz-grid">
            {quizzes.map((q) => (
              <div key={q.id} className="card quiz-card">
                <Link to={`/quiz/${q.id}`} className="quiz-card__link"><h2 style={{ fontSize: 20 }}>{q.title}</h2></Link>
                <span className="muted" style={{ fontSize: 14 }}>
                  {q.questions[0]?.count ?? 0} perguntas · editado em {fmt(q.updated_at)}
                </span>
                <div className="btn-row">
                  <button className="qz-btn qz-btn--primary" disabled={!q.questions[0]?.count} onClick={() => jogar(q.id)}>Jogar</button>
                  <Link to={`/quiz/${q.id}`} className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Editar</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
