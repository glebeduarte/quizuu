import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  if (session) return <Navigate to="/painel" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/painel` },
    })
    if (error) {
      setError('Não conseguimos enviar o link. Confira o e-mail e tente de novo em alguns segundos.')
      setStatus('error')
    } else setStatus('sent')
  }

  return (
    <div className="page">
      <header className="topbar"><Link to="/" className="wordmark">Quizuu</Link></header>
      <main className="narrow card">
        <h1 style={{ fontSize: 32, lineHeight: '38px' }}>Entrar como organizador</h1>
        <p className="muted" style={{ margin: 0 }}>Enviamos um link de acesso para o seu e-mail. Sem senha.</p>
        {status === 'sent' ? (
          <p className="notice notice--ok">Link enviado para {email}. Abra o e-mail neste aparelho para entrar.</p>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" className="input" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@escola.com.br" />
            </div>
            {status === 'error' && <p className="notice notice--err">{error}</p>}
            <button className="qz-btn qz-btn--primary" disabled={status === 'sending'}>
              {status === 'sending' ? 'Enviando…' : 'Enviar link de acesso'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
