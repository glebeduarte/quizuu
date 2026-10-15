import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

export default function Jogar() {
  const [pin, setPin] = useState('')
  const [nick, setNick] = useState('')
  const [step, setStep] = useState<'pin' | 'nick'>('pin')
  const [msg, setMsg] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (step === 'pin') {
      if (pin.length !== 6) return setMsg('O PIN tem 6 números.')
      setMsg(''); setStep('nick')
    } else {
      setMsg('As salas ao vivo chegam numa próxima etapa. Seu apelido está guardado nesta tela.')
    }
  }

  return (
    <div className="page on-stage">
      <header className="topbar"><Link to="/" className="wordmark">Quizuu</Link></header>
      <main className="narrow">
        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {step === 'pin' ? (
            <input className="input input--pin" inputMode="numeric" autoComplete="one-time-code" aria-label="PIN do jogo"
              placeholder="PIN do jogo" value={pin} maxLength={6}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
          ) : (
            <input className="input" style={{ textAlign: 'center', fontSize: 22 }} aria-label="Seu apelido"
              placeholder="Seu apelido" value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} autoFocus />
          )}
          <button className="qz-btn qz-btn--stage">{step === 'pin' ? 'Entrar' : 'Pronto!'}</button>
          {msg && <p className="muted" style={{ textAlign: 'center', margin: 0 }}>{msg}</p>}
        </form>
      </main>
    </div>
  )
}
