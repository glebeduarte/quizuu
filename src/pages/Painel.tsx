import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Quiz = { id: string; title: string; updated_at: string }

export default function Painel() {
  const { session } = useAuth()
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null)

  useEffect(() => {
    supabase.from('quizzes').select('id,title,updated_at').order('updated_at', { ascending: false })
      .then(({ data }) => setQuizzes(data ?? []))
  }, [])

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="wordmark">Quizuu</Link>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 14 }}>{session?.user.email}</span>
          <button className="qz-btn qz-btn--ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <main className="content" style={{ display: 'grid', gap: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 32 }}>Meus quizzes</h1>
          <button className="qz-btn qz-btn--primary" disabled title="Chega na próxima etapa">Novo quiz</button>
        </div>
        {quizzes === null ? (
          <p className="muted">Carregando…</p>
        ) : quizzes.length === 0 ? (
          <div className="card empty">
            <h2 style={{ fontSize: 22 }}>Nenhum quiz ainda</h2>
            <p className="muted" style={{ margin: 0, maxWidth: '40ch' }}>
              O editor de perguntas chega na próxima etapa. Aqui vão aparecer seus quizzes, prontos para abrir uma sala.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {quizzes.map((q) => (
              <div key={q.id} className="card"><h2 style={{ fontSize: 20 }}>{q.title}</h2></div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
