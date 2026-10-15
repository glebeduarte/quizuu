import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ANSWER, Shape } from '../lib/shapes'
import { channelFor, formatPoints, loadPlayer, savePlayer, type GameState, type PlayerSave } from '../lib/game'

type Result = { answered: boolean; is_correct: boolean; points: number; score: number; streak: number; rank: number; total: number }

const JOIN_ERRORS: Record<string, string> = {
  pin_nao_encontrado: 'Não encontramos uma sala com esse PIN.',
  partida_em_andamento: 'Essa partida já começou. Peça um novo PIN ao organizador.',
  apelido_em_uso: 'Esse apelido já está na sala. Escolha outro.',
  apelido_invalido: 'O apelido precisa ter de 1 a 20 caracteres.',
  apelido_ofensivo: 'Esse apelido não é permitido. Escolha outro.',
}

export default function Jogar() {
  const [params] = useSearchParams()
  const [pin, setPin] = useState(params.get('pin')?.replace(/\D/g, '').slice(0, 6) ?? '')
  const [nick, setNick] = useState('')
  const [step, setStep] = useState<'pin' | 'nick'>(pin.length === 6 ? 'nick' : 'pin')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [me, setMe] = useState<PlayerSave | null>(null)
  const [state, setState] = useState<GameState>({ phase: 'lobby' })
  const [picked, setPicked] = useState<number | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [remaining, setRemaining] = useState(0)
  const channel = useRef<RealtimeChannel | null>(null)

  // volta para a sala se a página recarregar
  useEffect(() => {
    const saved = loadPlayer()
    if (!saved) return
    supabase.rpc('rejoin_session', { p_player_id: saved.playerId, p_token: saved.token }).then(({ data }) => {
      const row = data?.[0]
      if (row && !row.kicked && row.status !== 'finished') setMe(saved)
      else savePlayer(null)
    })
  }, [])

  const fetchResult = useCallback(async (p: PlayerSave) => {
    const { data } = await supabase.rpc('my_result', { p_player_id: p.playerId, p_token: p.token })
    if (data?.[0]) setResult(data[0] as Result)
  }, [])

  useEffect(() => {
    if (!me) return
    const ch = channelFor(me.sessionId)
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const s = payload as GameState
      setState(s)
      if (s.phase === 'question') { setPicked(null); setResult(null); setRemaining(s.timeLimit) }
      if (s.phase === 'reveal' || s.phase === 'podium') fetchResult(me)
    }).on('broadcast', { event: 'kicked' }, ({ payload }) => {
      if ((payload as { playerId: string }).playerId === me.playerId) { savePlayer(null); setMe(null); setMsg('Você foi removido da sala pelo organizador.') }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') { ch.send({ type: 'broadcast', event: 'joined', payload: {} }); ch.send({ type: 'broadcast', event: 'sync', payload: {} }) }
    })
    channel.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [me, fetchResult])

  useEffect(() => {
    if (state.phase !== 'question') return
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(t)
  }, [state])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (step === 'pin') {
      if (pin.length !== 6) return setMsg('O PIN tem 6 números.')
      setMsg(''); setStep('nick'); return
    }
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('join_session', { p_pin: pin, p_nickname: nick })
    setBusy(false)
    if (error || !data?.[0]) {
      const key = Object.keys(JOIN_ERRORS).find((k) => error?.message.includes(k))
      setMsg(key ? JOIN_ERRORS[key] : 'Não foi possível entrar agora. Tente de novo.')
      if (key === 'pin_nao_encontrado' || key === 'partida_em_andamento') setStep('pin')
      return
    }
    const p = { playerId: data[0].player_id, token: data[0].reconnect_token, sessionId: data[0].session_id, nickname: nick.trim() }
    savePlayer(p); setMe(p); setState({ phase: 'lobby' })
  }

  async function answer(i: number) {
    if (!me || state.phase !== 'question' || picked !== null) return
    setPicked(i)
    navigator.vibrate?.(30)
    const { data } = await supabase.rpc('submit_answer', { p_player_id: me.playerId, p_token: me.token, p_option_id: state.optionIds[i] })
    if (!data?.[0]?.accepted) setMsg('O tempo acabou antes da sua resposta chegar.')
  }

  function leave() { savePlayer(null); setMe(null); setStep('pin'); setPin(''); setNick(''); setState({ phase: 'lobby' }) }

  // ---------- telas ----------
  if (!me) {
    return (
      <div className="page on-stage">
        <header className="topbar"><Link to="/" className="wordmark"><img src="/logo-wordmark-light.png" alt="Quizuu" /></Link></header>
        <main className="narrow">
          <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {step === 'pin' ? (
              <input className="input input--pin" inputMode="numeric" aria-label="PIN do jogo" placeholder="PIN do jogo"
                value={pin} maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
            ) : (
              <input className="input" style={{ textAlign: 'center', fontSize: 22 }} aria-label="Seu apelido" placeholder="Seu apelido"
                value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} autoFocus />
            )}
            <button className="qz-btn qz-btn--stage" disabled={busy}>{busy ? 'Entrando…' : step === 'pin' ? 'Entrar' : 'Pronto!'}</button>
            {msg && <p style={{ textAlign: 'center', margin: 0 }}>{msg}</p>}
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="page on-stage player">
      <header className="topbar">
        <strong className="player-nick">{me.nickname}</strong>
        {result && <span className="player-score">{formatPoints(result.score)} pts</span>}
      </header>

      {state.phase === 'lobby' && (
        <main className="center player-msg">
          <h1>Você está dentro!</h1>
          <p className="muted">Procure seu apelido no telão. A partida começa em instantes.</p>
        </main>
      )}

      {state.phase === 'question' && (picked === null ? (
        <main className="player-answers">
          <p className="player-meta">Pergunta {state.qIndex + 1} de {state.total} · {remaining}s</p>
          <div className={`player-grid n${state.optionIds.length}`}>
            {state.optionIds.map((id, i) => (
              <button key={id} className={`qz-answer qz-answer--${ANSWER[i].key}`} aria-label={`Resposta ${ANSWER[i].label}`} onClick={() => answer(i)}>
                <Shape index={i} />
              </button>
            ))}
          </div>
        </main>
      ) : (
        <main className="center player-msg">
          <h1>Resposta enviada</h1>
          <p className="muted">{msg || 'Aguarde a revelação no telão.'}</p>
        </main>
      ))}

      {(state.phase === 'reveal' || state.phase === 'leaderboard') && (
        <main className={`center player-msg ${result?.is_correct ? 'is-right' : 'is-wrong'}`}>
          {!result ? <p className="muted">Calculando…</p> : (
            <>
              <div className="verdict">{result.is_correct ? '✓' : '✕'}</div>
              <h1>{result.is_correct ? 'Você acertou!' : result.answered ? 'Não foi dessa vez' : 'Sem resposta'}</h1>
              {result.points > 0 && <p className="gain">+{formatPoints(result.points)}</p>}
              {result.streak >= 2 && <p>{result.streak} acertos seguidos</p>}
              <p className="muted">{result.rank}º lugar de {result.total}</p>
            </>
          )}
        </main>
      )}

      {state.phase === 'podium' && (
        <main className="center player-msg">
          <h1>{result ? `${result.rank}º lugar` : 'Fim de jogo'}</h1>
          {result && <p className="gain">{formatPoints(result.score)} pontos</p>}
          <button className="qz-btn qz-btn--stage" onClick={leave}>Jogar outra</button>
        </main>
      )}
    </div>
  )
}
