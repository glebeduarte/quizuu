import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ANSWER, Shape } from '../lib/shapes'
import { fetchPoll, pollChannel, voterId, type PollState, type WordCount } from '../lib/poll'
import { ChoiceResults, WordCloud } from '../lib/PollResults'

const ERROS: Record<string, string> = {
  votacao_fechada: 'A votação está pausada pelo apresentador.',
  pergunta_encerrada: 'Essa pergunta já foi encerrada. Veja a próxima.',
  palavra_bloqueada: 'Essa palavra não é permitida. Tente outra.',
  palavra_invalida: 'Use de 1 a 25 letras.',
  limite_palavras: 'Você já enviou 3 palavras nesta pergunta.',
}

export default function Votar() {
  const { code = '' } = useParams()
  const [state, setState] = useState<PollState | undefined>(undefined)
  const [mine, setMine] = useState<{ option: number | null; words: string[] }>({ option: null, words: [] })
  const [word, setWord] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const me = useRef(voterId())
  const qid = state?.question?.id

  const refresh = useCallback(async () => {
    const s = await fetchPoll(code)
    setState(s)
    if (s?.question) {
      const { data } = await supabase.rpc('poll_my_votes', { p_question_id: s.question.id, p_voter: me.current })
      setMine({ option: data?.option ?? null, words: data?.words ?? [] })
    }
  }, [code])

  useEffect(() => {
    refresh()
    const ch = pollChannel(code)
    ch.on('broadcast', { event: 'state' }, () => refresh()).subscribe()
    const t = setInterval(refresh, 4000)
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [code, refresh])

  useEffect(() => { setMsg(''); setWord('') }, [qid])

  async function send(body: { p_option?: number; p_word?: string }) {
    if (!state?.question) return
    setBusy(true); setMsg('')
    navigator.vibrate?.(25)
    const { error } = await supabase.rpc('poll_vote', { p_code: code, p_voter: me.current, p_question_id: state.question.id, p_option: body.p_option ?? null, p_word: body.p_word ?? null })
    setBusy(false)
    if (error) { const k = Object.keys(ERROS).find((x) => error.message.includes(x)); setMsg(k ? ERROS[k] : 'Não foi possível enviar. Tente de novo.'); return }
    const ch = pollChannel(code)
    ch.subscribe((s) => { if (s === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'vote', payload: {} }).then(() => supabase.removeChannel(ch)) })
    refresh()
  }

  function submitWord(e: FormEvent) { e.preventDefault(); if (word.trim()) { send({ p_word: word }); setWord('') } }

  const header = (
    <header className="topbar"><Link to="/" className="wordmark"><img src="/logo-wordmark-light.png" alt="Quizuu" /></Link><span className="vote-code">{code.toUpperCase()}</span></header>
  )

  if (state === undefined) return <div className="page on-stage">{header}<div className="center muted">Carregando…</div></div>
  if (state === null) return (
    <div className="page on-stage">{header}
      <main className="narrow" style={{ textAlign: 'center' }}><h1 style={{ fontSize: 28 }}>Votação não encontrada</h1><p className="muted">Confira o código na tela da apresentação.</p></main>
    </div>
  )

  const q = state.question
  const voted = q ? (q.kind === 'choice' ? mine.option !== null : mine.words.length > 0) : false

  return (
    <div className="page on-stage vote-page">
      {header}
      <main className="vote-main">
        <p className="vote-meta">{state.title} · pergunta {state.position} de {state.total}</p>
        {!q ? <h1 className="vote-prompt">Aguarde a próxima pergunta</h1> : (
          <>
            <h1 className="vote-prompt">{q.prompt}</h1>
            {!state.open && <p className="notice vote-paused">Votação pausada pelo apresentador.</p>}

            {q.kind === 'choice' && !voted && (
              <div className="vote-options">
                {q.options.map((o, i) => (
                  <button key={i} disabled={busy || !state.open} className={`vote-btn qz-answer--${ANSWER[i % 4].key}`} onClick={() => send({ p_option: i })}>
                    <Shape index={i % 4} /><span>{o}</span>
                  </button>
                ))}
              </div>
            )}

            {q.kind === 'words' && mine.words.length < 3 && (
              <form className="vote-word" onSubmit={submitWord}>
                <input className="input" value={word} maxLength={25} placeholder="Digite uma palavra" aria-label="Sua palavra" disabled={!state.open} onChange={(e) => setWord(e.target.value)} />
                <button className="qz-btn qz-btn--stage" disabled={busy || !word.trim() || !state.open}>Enviar</button>
                <span className="vote-hint">{3 - mine.words.length} de 3 palavras restantes</span>
              </form>
            )}

            {msg && <p className="vote-msg">{msg}</p>}

            {voted && (
              <section className="vote-results">
                <p className="vote-ok">✓ {q.kind === 'choice' ? 'Voto registrado' : 'Palavras enviadas'}</p>
                {q.kind === 'choice'
                  ? <ChoiceResults q={q} counts={(state.results as number[]) ?? []} mine={mine.option} />
                  : <WordCloud words={(state.results as WordCount[]) ?? []} mine={mine.words} />}
                <p className="vote-hint">{state.voters ?? 0} {state.voters === 1 ? 'pessoa votou' : 'pessoas votaram'}{q.kind === 'choice' ? '. Toque abaixo se quiser mudar.' : ''}</p>
                {q.kind === 'choice' && state.open && <button className="qz-btn qz-btn--ghost" style={{ color: '#fff' }} onClick={() => setMine({ ...mine, option: null })}>Mudar meu voto</button>}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
