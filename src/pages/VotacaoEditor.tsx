import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { ANSWER, Shape } from '../lib/shapes'
import { pollChannel, screenUrl, voteUrl } from '../lib/poll'

type Q = { id: string; kind: 'choice' | 'words'; prompt: string; options: string[] }
type Poll = { id: string; title: string; code: string; host_key: string; current_position: number; is_open: boolean }
const uid = () => crypto.randomUUID()

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <div className="copy-row">
        <input readOnly value={value} onFocus={(e) => e.target.select()} aria-label={label} />
        <button className="qz-btn qz-btn--secondary" onClick={async () => { try { await navigator.clipboard.writeText(value) } catch { /* sem permissão */ } setOk(true); setTimeout(() => setOk(false), 1600) }}>
          {ok ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {hint && <span className="muted copy-hint">{hint}</span>}
    </div>
  )
}

export default function VotacaoEditor() {
  const { id } = useParams()
  const [poll, setPoll] = useState<Poll | null>(null)
  const [title, setTitle] = useState('')
  const [qs, setQs] = useState<Q[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [tab, setTab] = useState<'perguntas' | 'apresentar'>('perguntas')
  const [confirmReset, setConfirmReset] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data } = await supabase.from('polls').select('id,title,code,host_key,current_position,is_open, poll_questions(id,kind,prompt,options,position)').eq('id', id!).single()
    if (!data) return
    setPoll(data as unknown as Poll); setTitle(data.title)
    const list = ((data.poll_questions ?? []) as (Q & { position: number })[]).sort((a, b) => a.position - b.position)
      .map(({ id, kind, prompt, options }) => ({ id, kind, prompt, options: kind === 'choice' && options.length < 2 ? [...options, '', ''].slice(0, 2) : options }))
    setQs(list.length ? list : [{ id: uid(), kind: 'choice', prompt: '', options: ['', ''] }])
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (i: number, patch: Partial<Q>) => { setQs((l) => l.map((q, k) => (k === i ? { ...q, ...patch } : q))); setDirty(true); setNotice(null) }
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= qs.length) return; setQs((l) => { const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c }); setDirty(true) }

  async function save() {
    if (!poll) return
    setSaving(true); setNotice(null)
    try {
      const fail = (e: unknown) => { if (e) throw e }
      fail((await supabase.from('polls').update({ title: title.trim() || 'Votação sem título', updated_at: new Date().toISOString() }).eq('id', poll.id)).error)
      const { data: existing } = await supabase.from('poll_questions').select('id').eq('poll_id', poll.id)
      const keep = new Set(qs.map((q) => q.id))
      const removed = (existing ?? []).map((x) => x.id).filter((x) => !keep.has(x))
      if (removed.length) fail((await supabase.from('poll_questions').delete().in('id', removed)).error)
      if (existing?.length) for (const x of existing.filter((x) => keep.has(x.id))) fail((await supabase.from('poll_questions').update({ position: -1 - Math.floor(Math.random() * 1e6) }).eq('id', x.id)).error)
      fail((await supabase.from('poll_questions').upsert(qs.map((q, i) => ({
        id: q.id, poll_id: poll.id, position: i + 1, kind: q.kind, prompt: q.prompt.trim(),
        options: q.kind === 'choice' ? q.options.map((o) => o.trim()).filter(Boolean) : [],
      })))).error)
      setDirty(false); setNotice({ kind: 'ok', text: 'Votação salva.' })
    } catch { setNotice({ kind: 'err', text: 'Não foi possível salvar. Tente de novo.' }) }
    setSaving(false)
  }

  async function control(patch: { position?: number; open?: boolean }) {
    if (!poll) return
    await supabase.rpc('poll_control', { p_code: poll.code, p_key: poll.host_key, p_position: patch.position ?? null, p_open: patch.open ?? null })
    setPoll({ ...poll, current_position: patch.position ?? poll.current_position, is_open: patch.open ?? poll.is_open })
    const ch = pollChannel(poll.code)
    ch.subscribe((s) => { if (s === 'SUBSCRIBED') { ch.send({ type: 'broadcast', event: 'state', payload: {} }).then(() => supabase.removeChannel(ch)) } })
  }

  async function resetVotes() {
    if (!poll) return
    await supabase.from('poll_votes').delete().eq('poll_id', poll.id)
    setConfirmReset(false); setNotice({ kind: 'ok', text: 'Votos zerados.' })
    control({ position: 1 })
  }

  function downloadQr() {
    const canvas = qrRef.current?.querySelector('canvas'); if (!canvas || !poll) return
    const out = document.createElement('canvas'); const pad = 60, s = canvas.width
    out.width = s + pad * 2; out.height = s + pad * 2 + 120
    const g = out.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height)
    g.drawImage(canvas, pad, pad)
    g.fillStyle = '#22103a'; g.textAlign = 'center'
    g.font = '800 44px "Baloo 2", sans-serif'; g.fillText(`Código ${poll.code}`, out.width / 2, s + pad + 60)
    g.font = '600 26px Nunito, sans-serif'; g.fillStyle = '#6b5785'; g.fillText(voteUrl(poll.code).replace(/^https?:\/\//, ''), out.width / 2, s + pad + 104)
    const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = `quizuu-votacao-${poll.code}.png`; a.click()
  }

  if (!poll) return <div className="page"><div className="center muted">Carregando votação…</div></div>
  const ready = qs.every((q) => q.prompt.trim() && (q.kind === 'words' || q.options.filter((o) => o.trim()).length >= 2))

  return (
    <div className="page">
      <header className="topbar editor-top">
        <Link to="/votacoes" className="qz-btn qz-btn--ghost" style={{ paddingLeft: 0 }}>← Votações</Link>
        <input className="input title-input" aria-label="Título da votação" value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setDirty(true) }} />
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <span className="muted save-state">{saving ? 'Salvando…' : dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span>
          <button className="qz-btn qz-btn--primary" onClick={save} disabled={saving || !dirty}>Salvar</button>
        </div>
      </header>
      <main className="content" style={{ display: 'grid', gap: 'var(--space-6)' }}>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'perguntas'} className={tab === 'perguntas' ? 'on' : ''} onClick={() => setTab('perguntas')}>Perguntas</button>
          <button role="tab" aria-selected={tab === 'apresentar'} className={tab === 'apresentar' ? 'on' : ''} onClick={() => setTab('apresentar')}>Apresentar</button>
        </div>
        {notice && <p className={`notice notice--${notice.kind}`} style={{ margin: 0 }}>{notice.text}</p>}

        {tab === 'perguntas' ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {qs.map((q, i) => (
              <section key={q.id} className="card pq">
                <div className="q-toolbar">
                  <strong className="h2">Pergunta {i + 1}</strong>
                  <div className="btn-row">
                    <div className="seg seg--sm">
                      <button className={q.kind === 'choice' ? 'on' : ''} onClick={() => upd(i, { kind: 'choice', options: q.options.length >= 2 ? q.options : ['', ''] })}>Múltipla escolha</button>
                      <button className={q.kind === 'words' ? 'on' : ''} onClick={() => upd(i, { kind: 'words' })}>Nuvem de palavras</button>
                    </div>
                    <button className="qz-btn qz-btn--ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                    <button className="qz-btn qz-btn--ghost" onClick={() => move(i, 1)} disabled={i === qs.length - 1} aria-label="Descer">↓</button>
                    <button className="qz-btn qz-btn--ghost danger-link" disabled={qs.length === 1} onClick={() => { setQs((l) => l.filter((_, k) => k !== i)); setDirty(true) }}>Excluir</button>
                  </div>
                </div>
                <textarea className="input textarea" rows={2} maxLength={200} placeholder={q.kind === 'words' ? 'Ex.: Em uma palavra, como você chega hoje?' : 'Ex.: Qual tema você quer aprofundar?'}
                  value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} />
                {q.kind === 'choice' ? (
                  <div className="pq-opts">
                    {q.options.map((o, k) => (
                      <div key={k} className="pq-opt">
                        <span className={`rq-shape qz-answer--${ANSWER[k % 4].key}`}><Shape index={k % 4} /></span>
                        <input className="input" value={o} maxLength={80} placeholder={`Opção ${k + 1}`} onChange={(e) => upd(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} />
                        {q.options.length > 2 && <button className="q-del" aria-label={`Remover opção ${k + 1}`} onClick={() => upd(i, { options: q.options.filter((_, j) => j !== k) })}>×</button>}
                      </div>
                    ))}
                    {q.options.length < 6 && <button className="qz-btn qz-btn--ghost" style={{ justifySelf: 'start', paddingLeft: 0 }} onClick={() => upd(i, { options: [...q.options, ''] })}>+ Opção</button>}
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0, fontSize: 14 }}>Cada pessoa envia até 3 palavras de até 25 letras. Palavrões são barrados automaticamente.</p>
                )}
              </section>
            ))}
            <button className="qz-btn qz-btn--secondary" onClick={() => { setQs((l) => [...l, { id: uid(), kind: 'choice', prompt: '', options: ['', ''] }]); setDirty(true) }}>+ Pergunta</button>
            {!ready && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Toda pergunta precisa de enunciado, e as de múltipla escolha de pelo menos 2 opções.</p>}
          </div>
        ) : (
          <div className="present">
            {dirty && <p className="notice notice--err" style={{ margin: 0 }}>Salve as alterações antes de apresentar.</p>}
            <section className="card present-live">
              <div>
                <span className="eyebrow">Ao vivo agora</span>
                <h2 style={{ fontSize: 24, margin: '6px 0' }}>Pergunta {poll.current_position} de {qs.length}</h2>
                <p className="muted" style={{ margin: 0 }}>{qs[poll.current_position - 1]?.prompt || 'Sem enunciado'}</p>
              </div>
              <div className="btn-row">
                <button className="qz-btn qz-btn--secondary" disabled={poll.current_position <= 1} onClick={() => control({ position: poll.current_position - 1 })}>← Anterior</button>
                <button className="qz-btn qz-btn--primary" disabled={poll.current_position >= qs.length} onClick={() => control({ position: poll.current_position + 1 })}>Próxima →</button>
                <button className="qz-btn qz-btn--ghost" onClick={() => control({ open: !poll.is_open })}>{poll.is_open ? 'Pausar votos' : 'Reabrir votos'}</button>
                <a className="qz-btn qz-btn--ghost" href={screenUrl(poll.code, poll.host_key)} target="_blank" rel="noopener">Abrir tela ↗</a>
              </div>
            </section>

            <div className="present-grid">
              <section className="card present-share">
                <h3>Para a plateia votar</h3>
                <div ref={qrRef} className="qr-box"><QRCodeCanvas value={voteUrl(poll.code)} size={480} marginSize={1} style={{ width: 168, height: 168 }} /></div>
                <p className="present-code">Código <strong>{poll.code}</strong></p>
                <CopyField label="Link de votação" value={voteUrl(poll.code)} />
                <button className="qz-btn qz-btn--secondary" onClick={downloadQr}>Baixar QR code (PNG)</button>
              </section>

              <section className="card present-embed">
                <h3>Módulo para o PowerPoint</h3>
                <CopyField label="Tela do resultado (segue a pergunta ao vivo)" value={screenUrl(poll.code, poll.host_key)}
                  hint="Use em um slide só. Você avança pelas setas do teclado na própria tela ou pelo botão Próxima aqui." />
                <details className="per-slide">
                  <summary>Um link por pergunta (um slide para cada)</summary>
                  <p className="muted" style={{ fontSize: 14, margin: '8px 0' }}>Quando o slide aparece, a votação muda sozinha para aquela pergunta.</p>
                  {qs.map((q, i) => <CopyField key={q.id} label={`Pergunta ${i + 1}: ${q.prompt || 'sem enunciado'}`} value={screenUrl(poll.code, poll.host_key, i + 1)} />)}
                </details>
                <ol className="howto">
                  <li>No PowerPoint, vá em <strong>Inserir → Suplementos → Obter suplementos</strong> e instale o <strong>Web Viewer</strong>.</li>
                  <li>No slide, insira o Web Viewer e cole o link da tela.</li>
                  <li>Durante a apresentação o resultado atualiza sozinho.</li>
                </ol>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>Esses links trazem a chave do apresentador. Não compartilhe com a plateia; para ela, use o link de votação.</p>
              </section>
            </div>

            <section className="card present-reset">
              {confirmReset ? (
                <div className="confirm-box">
                  <p>Apagar todos os votos desta votação e voltar para a pergunta 1?</p>
                  <div className="btn-row"><button className="qz-btn qz-btn--secondary" onClick={() => setConfirmReset(false)}>Cancelar</button><button className="qz-btn qz-btn--danger" onClick={resetVotes}>Zerar votos</button></div>
                </div>
              ) : <button className="qz-btn qz-btn--ghost danger-link" onClick={() => setConfirmReset(true)}>Zerar votos para apresentar de novo</button>}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
