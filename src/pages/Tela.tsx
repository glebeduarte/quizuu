import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { fetchPoll, pollChannel, voteUrl, type PollState, type WordCount } from '../lib/poll'
import { ChoiceResults, WordCloud } from '../lib/PollResults'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Tela de resultado para projetar ou incorporar no PowerPoint (Web Viewer).
// ?k=chave do apresentador libera o controle; ?p=N fixa e ativa a pergunta N ao abrir.
export default function Tela() {
  const { code = '' } = useParams()
  const [params] = useSearchParams()
  const key = params.get('k')
  const pinned = Number(params.get('p')) || undefined
  const [state, setState] = useState<PollState | undefined>(undefined)
  const ch = useRef<RealtimeChannel | null>(null)
  const pending = useRef(0)

  const refresh = useCallback(async () => { setState(await fetchPoll(code, pinned)) }, [code, pinned])

  const control = useCallback(async (patch: { position?: number; open?: boolean }) => {
    if (!key) return
    const { error } = await supabase.rpc('poll_control', { p_code: code, p_key: key, p_position: patch.position ?? null, p_open: patch.open ?? null })
    if (!error) { ch.current?.send({ type: 'broadcast', event: 'state', payload: {} }); refresh() }
  }, [code, key, refresh])

  useEffect(() => {
    const c = pollChannel(code)
    c.on('broadcast', { event: 'vote' }, () => {
      window.clearTimeout(pending.current); pending.current = window.setTimeout(refresh, 350)
    }).on('broadcast', { event: 'state' }, () => refresh())
      .subscribe((s) => { if (s === 'SUBSCRIBED' && pinned && key) control({ position: pinned }) })
    ch.current = c
    refresh()
    const t = setInterval(refresh, 3000)
    return () => { clearInterval(t); supabase.removeChannel(c) }
  }, [code, pinned, key, refresh, control])

  useEffect(() => {
    if (!key || pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (!state) return
      if (e.key === 'ArrowRight' && state.position < state.total) control({ position: state.position + 1 })
      if (e.key === 'ArrowLeft' && state.position > 1) control({ position: state.position - 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, pinned, state, control])

  const url = voteUrl(code)
  const q = state?.question

  return (
    <div className="tela">
      <div className="tela-in">
        <header className="tela-head">
          <img src="/logo-wordmark-light.png" alt="Quizuu" className="tela-logo" />
          {state && <span className="tela-count">{state.voters ?? 0} {state.voters === 1 ? 'voto' : 'votos'}</span>}
        </header>
        {state === undefined ? <p className="tela-wait">Carregando…</p> : state === null ? <p className="tela-wait">Votação não encontrada.</p> : (
          <div className="tela-body">
            <div className="tela-main">
              <h1 className="tela-prompt" key={q?.id}>{q?.prompt || 'Aguarde a próxima pergunta'}</h1>
              {q && (q.kind === 'choice'
                ? <ChoiceResults q={q} counts={(state.results as number[]) ?? []} size="lg" />
                : <WordCloud words={(state.results as WordCount[]) ?? []} size="lg" />)}
            </div>
            <aside className="tela-join">
              <div className="tela-qr"><QRCodeSVG value={url} size={220} marginSize={1} style={{ width: '100%', height: 'auto' }} /></div>
              <p>Vote em</p>
              <strong className="tela-url">{url.replace(/^https?:\/\//, '').replace(/\/v\/.*$/, '/v')}</strong>
              <span className="tela-code">{code.toUpperCase()}</span>
              {!state.open && <span className="tela-paused">Votação pausada</span>}
            </aside>
          </div>
        )}
        {key && state && !pinned && (
          <nav className="tela-ctrl" aria-label="Controle do apresentador">
            <button disabled={state.position <= 1} onClick={() => control({ position: state.position - 1 })} aria-label="Pergunta anterior">←</button>
            <span>{state.position}/{state.total}</span>
            <button disabled={state.position >= state.total} onClick={() => control({ position: state.position + 1 })} aria-label="Próxima pergunta">→</button>
            <button onClick={() => control({ open: !state.open })}>{state.open ? 'Pausar' : 'Reabrir'}</button>
          </nav>
        )}
      </div>
    </div>
  )
}
