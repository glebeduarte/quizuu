import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { randomCode } from '../lib/poll'

type Poll = { id: string; title: string; code: string; updated_at: string; poll_questions: { count: number }[] }

export function PanelTabs({ active }: { active: 'quizzes' | 'votacoes' }) {
  return (
    <nav className="panel-tabs" aria-label="Seções">
      <Link to="/painel" className={active === 'quizzes' ? 'on' : ''}>Quizzes</Link>
      <Link to="/votacoes" className={active === 'votacoes' ? 'on' : ''}>Votações</Link>
    </nav>
  )
}

export default function Votacoes() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [polls, setPolls] = useState<Poll[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('polls').select('id,title,code,updated_at,poll_questions(count)').order('updated_at', { ascending: false })
      .then(({ data }) => setPolls((data as Poll[]) ?? []))
  }, [])

  async function nova() {
    setBusy(true); setError('')
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabase.from('polls').insert({ owner_id: session!.user.id, code: randomCode() }).select('id').single()
      if (data) {
        await supabase.from('poll_questions').insert({ poll_id: data.id, position: 1, kind: 'choice', prompt: '', options: ['', ''] })
        navigate(`/votacao/${data.id}`); return
      }
      if (error && error.code !== '23505') break
    }
    setError('Não foi possível criar a votação. Tente de novo.'); setBusy(false)
  }

  async function excluir(id: string) {
    const { error } = await supabase.from('polls').delete().eq('id', id)
    setConfirmId(null)
    if (error) { setError('Não foi possível excluir. Tente de novo.'); return }
    setPolls((p) => (p ?? []).filter((x) => x.id !== id))
  }

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
        <PanelTabs active="votacoes" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 32 }}>Votações</h1>
            <p className="muted" style={{ margin: '4px 0 0' }}>Perguntas para a plateia votar pelo celular, com o resultado ao vivo na sua apresentação.</p>
          </div>
          <button className="qz-btn qz-btn--primary" onClick={nova} disabled={busy}>{busy ? 'Criando…' : 'Nova votação'}</button>
        </div>
        {error && <p className="notice notice--err">{error}</p>}
        {polls === null ? <p className="muted">Carregando…</p> : polls.length === 0 ? (
          <div className="card empty">
            <h2 style={{ fontSize: 22 }}>Nenhuma votação ainda</h2>
            <p className="muted" style={{ margin: 0, maxWidth: '44ch' }}>Crie uma sequência de perguntas de múltipla escolha ou nuvem de palavras e coloque o resultado dentro do seu PowerPoint.</p>
          </div>
        ) : (
          <div className="quiz-grid">
            {polls.map((p) => (
              <div key={p.id} className="card quiz-card">
                <Link to={`/votacao/${p.id}`} className="quiz-card__link"><h2 style={{ fontSize: 20 }}>{p.title}</h2></Link>
                <span className="muted" style={{ fontSize: 14 }}>{p.poll_questions[0]?.count ?? 0} perguntas · código {p.code}</span>
                {confirmId === p.id ? (
                  <div className="confirm-box" role="alert">
                    <p>Excluir “{p.title}” e todos os votos? Não dá para desfazer.</p>
                    <div className="btn-row">
                      <button className="qz-btn qz-btn--secondary" onClick={() => setConfirmId(null)}>Cancelar</button>
                      <button className="qz-btn qz-btn--danger" onClick={() => excluir(p.id)}>Excluir</button>
                    </div>
                  </div>
                ) : (
                  <div className="btn-row">
                    <Link to={`/votacao/${p.id}`} className="qz-btn qz-btn--primary" style={{ textDecoration: 'none' }}>Abrir</Link>
                    <button className="qz-btn qz-btn--ghost icon-btn" aria-label={`Excluir ${p.title}`} onClick={() => setConfirmId(p.id)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
