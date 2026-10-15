import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const ERRORS: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha não conferem.',
  user_already_exists: 'Já existe uma conta com esse e-mail. Use "Entrar".',
  weak_password: 'A senha precisa ter pelo menos 6 caracteres.',
  over_email_send_rate_limit: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
}

export default function Login() {
  const { session } = useAuth()
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (session) return <Navigate to="/painel" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const creds = { email: email.trim(), password }
    let err = null
    if (mode === 'criar') {
      const { data, error } = await supabase.auth.signUp({ ...creds, options: { data: { name: name.trim() } } })
      err = error
      if (!error && !data.session) err = (await supabase.auth.signInWithPassword(creds)).error
    } else {
      err = (await supabase.auth.signInWithPassword(creds)).error
    }
    if (err) setError(ERRORS[(err as { code?: string }).code ?? ''] ?? 'Não foi possível entrar agora. Tente de novo em instantes.')
    setBusy(false)
  }

  return (
    <div className="page">
      <header className="topbar"><Link to="/" className="wordmark"><picture><source srcSet="/logo-wordmark-light.png" media="(prefers-color-scheme: dark)" /><img src="/logo-wordmark.png" alt="Quizuu" /></picture></Link></header>
      <main className="narrow card">
        <h1 style={{ fontSize: 32, lineHeight: '38px' }}>{mode === 'entrar' ? 'Entrar como organizador' : 'Criar conta de organizador'}</h1>
        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {mode === 'criar' && (
            <div className="field">
              <label htmlFor="name">Seu nome</label>
              <input id="name" className="input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" className="input" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@escola.com.br" />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input id="password" className="input" type="password" required minLength={6}
              autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="notice notice--err" style={{ margin: 0 }}>{error}</p>}
          <button className="qz-btn qz-btn--primary" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta e entrar'}
          </button>
        </form>
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          {mode === 'entrar' ? 'Primeira vez aqui? ' : 'Já tem conta? '}
          <button className="qz-btn qz-btn--ghost" style={{ minHeight: 0, padding: 0, display: 'inline' }}
            onClick={() => { setMode(mode === 'entrar' ? 'criar' : 'entrar'); setError('') }}>
            {mode === 'entrar' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </main>
    </div>
  )
}
