import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { ANSWER, Shape } from '../lib/shapes'
import { channelFor, formatPin, formatPoints, type GameState } from '../lib/game'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { sfx, stopMusic, unlock } from '../lib/sound'
import SoundToggle from '../lib/SoundToggle'

type Option = { id: string; label: string; is_correct: boolean; position: number }
type Question = { id: string; prompt: string; kind: string; time_limit_s: number; points_multiplier: number; position: number; options: Option[] }
type Player = { id: string; nickname: string; score: number; streak: number; correct_time_ms: number }

export default function Host() {
  const { sessionId } = useParams()
  const [pin, setPin] = useState('')
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [state, setState] = useState<GameState>({ phase: 'lobby' })
  const [remaining, setRemaining] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [error, setError] = useState('')
  const channel = useRef<RealtimeChannel | null>(null)
  const stateRef = useRef(state); stateRef.current = state
  const endsAt = useRef(0)
  const revealedFor = useRef(-1)
  const lastLeft = useRef(99)
  const prevCount = useRef(0)
  const [soundOn, setSoundOn] = useState(false)

  // trilha de cada fase
  const phaseKey = state.phase + ('qIndex' in state ? state.qIndex : '')
  useEffect(() => {
    if (!soundOn) return
    const p = stateRef.current.phase
    if (p === 'lobby') sfx.lobby()
    else if (p === 'question') { sfx.questionStart(); const t = setTimeout(() => sfx.questionMusic(), 900); return () => clearTimeout(t) }
    else if (p === 'reveal') sfx.timeUp()
    else if (p === 'leaderboard') sfx.drumroll(1.2)
    else if (p === 'podium') sfx.fanfare()
  }, [phaseKey, soundOn])
  useEffect(() => () => stopMusic(), [])

  // um "pop" para cada jogador que entra
  useEffect(() => {
    if (soundOn && state.phase === 'lobby' && players.length > prevCount.current) sfx.join()
    prevCount.current = players.length
  }, [players.length, soundOn, state.phase])

  const broadcast = useCallback((s: GameState) => {
    setState(s)
    channel.current?.send({ type: 'broadcast', event: 'state', payload: s })
  }, [])

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase.from('players').select('id,nickname,score,streak,correct_time_ms')
      .eq('session_id', sessionId!).eq('kicked', false).order('score', { ascending: false }).order('correct_time_ms').order('joined_at')
    setPlayers(data ?? [])
  }, [sessionId])

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('sessions')
        .select('pin, status, current_question_id, question_started_at, quizzes(title, questions(id,prompt,kind,time_limit_s,points_multiplier,position, options(id,label,is_correct,position)))')
        .eq('id', sessionId!).single()
      if (error || !data) { setError('Sala não encontrada.'); return }
      type Q = { title: string; questions: Question[] }
      const quiz = data.quizzes as unknown as Q
      setPin(data.pin); setTitle(quiz.title)
      const qs = quiz.questions.filter((q) => q.options.length >= 2).sort((a, b) => a.position - b.position)
        .map((q) => ({ ...q, options: [...q.options].sort((a, b) => a.position - b.position) }))
      setQuestions(qs)
      await loadPlayers()
      // telão recarregado no meio da partida: retoma de onde parou
      const i = qs.findIndex((q) => q.id === data.current_question_id)
      if (data.status === 'finished') setState({ phase: 'podium' })
      else if (i >= 0) {
        const q = qs[i], base = { qIndex: i, total: qs.length, optionIds: q.options.map((o) => o.id) }
        if (data.status === 'question') {
          endsAt.current = new Date(data.question_started_at).getTime() + q.time_limit_s * 1000
          setState({ phase: 'question', ...base, timeLimit: q.time_limit_s, kind: q.kind })
        } else if (data.status === 'reveal') {
          const { data: ans } = await supabase.from('answers').select('option_id').eq('session_id', sessionId!).eq('question_id', q.id)
          revealedFor.current = i
          setState({ phase: 'reveal', ...base, correctIndex: q.options.findIndex((o) => o.is_correct), counts: q.options.map((o) => (ans ?? []).filter((a) => a.option_id === o.id).length) })
        } else if (data.status === 'leaderboard') setState({ phase: 'leaderboard', qIndex: i, total: qs.length })
      }
    })()
    const ch = channelFor(sessionId!)
    ch.on('broadcast', { event: 'joined' }, () => loadPlayers())
      .on('broadcast', { event: 'sync' }, () => ch.send({ type: 'broadcast', event: 'state', payload: stateRef.current }))
      .subscribe()
    channel.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, loadPlayers])

  // lobby: atualiza a lista de jogadores com frequência
  useEffect(() => {
    if (state.phase !== 'lobby') return
    const t = setInterval(loadPlayers, 3000)
    return () => clearInterval(t)
  }, [state.phase, loadPlayers])

  const reveal = useCallback(async () => {
    const s = stateRef.current
    if (s.phase !== 'question' || revealedFor.current === s.qIndex) return
    revealedFor.current = s.qIndex
    const q = questions[s.qIndex]
    await supabase.from('sessions').update({ status: 'reveal' }).eq('id', sessionId!)
    const { data } = await supabase.from('answers').select('option_id').eq('session_id', sessionId!).eq('question_id', q.id)
    const counts = q.options.map((o) => (data ?? []).filter((a) => a.option_id === o.id).length)
    broadcast({ phase: 'reveal', qIndex: s.qIndex, total: s.total, optionIds: s.optionIds, correctIndex: q.options.findIndex((o) => o.is_correct), counts })
    loadPlayers()
  }, [questions, sessionId, broadcast, loadPlayers])

  // pergunta: cronômetro e contagem de respostas
  useEffect(() => {
    if (state.phase !== 'question') return
    const q = questions[state.qIndex]
    const tick = setInterval(async () => {
      const left = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000))
      setRemaining(left)
      if (left !== lastLeft.current && left > 0 && left <= 5) sfx.tick(left <= 1)
      lastLeft.current = left
      const { count } = await supabase.from('answers').select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId!).eq('question_id', q.id)
      setAnswered(count ?? 0)
      if (left <= 0 || (count ?? 0) >= players.length) { clearInterval(tick); reveal() }
    }, 500)
    return () => clearInterval(tick)
  }, [state, questions, sessionId, players.length, reveal])

  async function openQuestion(i: number) {
    setError('')
    const q = questions[i]
    const { error } = await supabase.rpc('open_question', { p_session_id: sessionId, p_question_id: q.id })
    if (error) { setError('Não foi possível abrir a pergunta. Tente de novo.'); return }
    endsAt.current = Date.now() + q.time_limit_s * 1000
    setRemaining(q.time_limit_s); setAnswered(0)
    broadcast({ phase: 'question', qIndex: i, total: questions.length, optionIds: q.options.map((o) => o.id), timeLimit: q.time_limit_s, kind: q.kind })
  }

  async function showLeaderboard() {
    if (state.phase !== 'reveal') return
    await supabase.from('sessions').update({ status: 'leaderboard' }).eq('id', sessionId!)
    await loadPlayers()
    broadcast({ phase: 'leaderboard', qIndex: state.qIndex, total: state.total })
  }

  async function finish() {
    await supabase.from('sessions').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', sessionId!)
    await loadPlayers()
    broadcast({ phase: 'podium' })
  }

  async function kick(p: Player) {
    await supabase.from('players').update({ kicked: true }).eq('id', p.id)
    channel.current?.send({ type: 'broadcast', event: 'kicked', payload: { playerId: p.id } })
    loadPlayers()
  }

  const joinUrl = `${window.location.origin}/jogar?pin=${pin}`
  const q = 'qIndex' in state ? questions[state.qIndex] : null

  return (
    <div className="page on-stage host" onPointerDown={() => { if (!soundOn) { unlock(); setSoundOn(true) } }}>
      <header className="topbar">
        <Link to="/painel" className="wordmark"><img src="/logo-wordmark-light.png" alt="Quizuu" /></Link>
        <span className="muted host-title">{title}{'qIndex' in state ? ` · ${state.qIndex + 1} de ${state.total}` : ''}</span>
        <SoundToggle onEnable={() => setSoundOn(true)} />
      </header>
      {!soundOn && state.phase === 'lobby' && (
        <button className="sound-cta content" onClick={() => { unlock(); setSoundOn(true) }}>Toque aqui para ligar a música do telão</button>
      )}
      {error && <p className="notice notice--err content">{error}</p>}

      {state.phase === 'lobby' && (
        <main className="content lobby">
          <div className="lobby-join">
            <div className="qz-pin">
              <span className="qz-pin__label">PIN do jogo</span>
              <span className="qz-pin__code">{pin ? formatPin(pin) : '··· ···'}</span>
              <span className="qz-pin__hint">Entre em {window.location.host}/jogar</span>
            </div>
            {pin && <div className="qr"><QRCodeSVG value={joinUrl} size={168} marginSize={2} /></div>}
          </div>
          <div className="lobby-players">
            <div className="lobby-head">
              <strong className="big-count">{players.length}</strong>
              <span>{players.length === 1 ? 'jogador' : 'jogadores'}</span>
              <button className="qz-btn qz-btn--stage" style={{ marginLeft: 'auto' }}
                disabled={players.length === 0 || questions.length === 0} onClick={() => openQuestion(0)}>Iniciar partida</button>
            </div>
            {players.length === 0 ? <p className="muted">Aguardando jogadores…</p> : (
              <ul className="chips">
                {players.map((p) => (
                  <li key={p.id} className="chip">{p.nickname}
                    <button aria-label={`Remover ${p.nickname}`} onClick={() => kick(p)}>×</button></li>
                ))}
              </ul>
            )}
          </div>
        </main>
      )}

      {state.phase === 'question' && q && (
        <main className="content stage-q">
          <div className="stage-top">
            <div className="qz-timer"><TimerRing value={remaining} max={q.time_limit_s} /><span className="qz-timer__num">{remaining}</span></div>
            <h1 className="stage-prompt">{q.prompt}</h1>
            <div className="answered"><strong>{answered}</strong><span>respostas</span></div>
          </div>
          <div className="qz-answers stage-answers">
            {q.options.map((o, i) => (
              <div key={o.id} className={`qz-answer qz-answer--${ANSWER[i].key}`}><Shape index={i} />{o.label}</div>
            ))}
          </div>
        </main>
      )}

      {state.phase === 'reveal' && q && (
        <main className="content stage-q">
          <h1 className="stage-prompt" style={{ textAlign: 'center' }}>{q.prompt}</h1>
          <div className="bars">
            {q.options.map((o, i) => {
              const max = Math.max(1, ...state.counts)
              return (
                <div key={o.id} className="bar-col">
                  <span className="bar-num">{state.counts[i]}</span>
                  <div className={`bar qz-answer--${ANSWER[i].key}`} style={{ height: `${8 + (state.counts[i] / max) * 140}px` }} />
                  <span className={`bar-shape qz-answer--${ANSWER[i].key}`}><Shape index={i} />{i === state.correctIndex && '✓'}</span>
                </div>
              )
            })}
          </div>
          <div className="qz-answers stage-answers">
            {q.options.map((o, i) => (
              <div key={o.id} className={`qz-answer qz-answer--${ANSWER[i].key}${i === state.correctIndex ? '' : ' is-dimmed'}`}>
                <Shape index={i} />{o.label}
                {i === state.correctIndex && <span className="qz-mark"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7" /></svg></span>}
              </div>
            ))}
          </div>
          <div className="stage-actions"><button className="qz-btn qz-btn--stage" onClick={showLeaderboard}>Ver ranking</button></div>
        </main>
      )}

      {state.phase === 'leaderboard' && (
        <main className="content narrow-wide">
          <h1 className="stage-title">Ranking</h1>
          <Ranking players={players.slice(0, 5)} />
          <div className="stage-actions">
            {state.qIndex + 1 < questions.length
              ? <button className="qz-btn qz-btn--stage" onClick={() => openQuestion(state.qIndex + 1)}>Próxima pergunta</button>
              : <button className="qz-btn qz-btn--stage" onClick={finish}>Ver pódio</button>}
          </div>
        </main>
      )}

      {state.phase === 'podium' && (
        <main className="content narrow-wide">
          <h1 className="stage-title">Pódio</h1>
          <div className="podium">
            {[1, 0, 2].map((rank) => players[rank] && (
              <div key={rank} className={`podium-col p${rank + 1}`}>
                <strong className="podium-name">{players[rank].nickname}</strong>
                <span>{formatPoints(players[rank].score)} pts</span>
                <div className="podium-block">{rank + 1}º</div>
              </div>
            ))}
          </div>
          <div className="stage-actions" style={{ gap: 12 }}>
            <Link to={`/relatorio/${sessionId}`} className="qz-btn qz-btn--stage" style={{ textDecoration: 'none' }}>Ver relatório</Link>
            <Link to="/painel" className="qz-btn qz-btn--ghost" style={{ textDecoration: 'none', color: 'var(--on-color)' }}>Voltar ao painel</Link>
          </div>
        </main>
      )}
    </div>
  )
}

function TimerRing({ value, max }: { value: number; max: number }) {
  const c = 2 * Math.PI * 43
  return (
    <svg viewBox="0 0 96 96">
      <circle className="qz-timer__track" cx="48" cy="48" r="43" />
      <circle className="qz-timer__ring" cx="48" cy="48" r="43" strokeDasharray={c} strokeDashoffset={c * (1 - value / max)}
        style={value <= 5 ? { stroke: 'var(--answer-red)' } : undefined} />
    </svg>
  )
}

export function Ranking({ players, meId }: { players: Player[]; meId?: string }) {
  return (
    <div className="qz-rank">
      {players.map((p, i) => (
        <div key={p.id} className={`qz-rank__row${i < 3 ? ` qz-rank__row--${i + 1}` : ''}${p.id === meId ? ' is-me' : ''}`}>
          <span className="qz-rank__pos">{i + 1}</span>
          <span className="qz-rank__name">{p.nickname}{p.streak >= 2 && <span className="qz-streak">{p.streak} seguidas</span>}</span>
          <span className="qz-rank__score">{formatPoints(p.score)}</span>
        </div>
      ))}
    </div>
  )
}
