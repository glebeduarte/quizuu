import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ANSWER, Shape } from '../lib/shapes'
import { saveQuiz } from '../lib/saveQuiz'

type Option = { id: string; label: string; is_correct: boolean }
type Kind = 'multiple_choice' | 'true_false'
type Question = { id: string; kind: Kind; prompt: string; media_url: string; time_limit_s: number; points_multiplier: number; options: Option[] }

const TIMES = [5, 10, 20, 30, 60, 90, 120]
const uid = () => crypto.randomUUID()
const blankOptions = (): Option[] => Array.from({ length: 4 }, () => ({ id: uid(), label: '', is_correct: false }))
const tfOptions = (): Option[] => [{ id: uid(), label: 'Verdadeiro', is_correct: true }, { id: uid(), label: 'Falso', is_correct: false }]
const newQuestion = (): Question => ({ id: uid(), kind: 'multiple_choice', prompt: '', media_url: '', time_limit_s: 20, points_multiplier: 1, options: blankOptions() })

function problems(q: Question): string[] {
  const p: string[] = []
  if (!q.prompt.trim()) p.push('falta o enunciado')
  const filled = q.options.filter((o) => o.label.trim())
  if (filled.length < 2) p.push('precisa de pelo menos 2 respostas')
  if (filled.filter((o) => o.is_correct).length !== 1) p.push('marque uma resposta certa')
  return p
}

export default function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('quizzes')
        .select('title, questions(id,kind,prompt,media_url,time_limit_s,points_multiplier,position, options(id,label,is_correct,position))')
        .eq('id', id!).single()
      if (error || !data) { navigate('/painel', { replace: true }); return }
      setTitle(data.title)
      type Row = Question & { position: number; options: (Option & { position: number })[]; media_url: string | null }
      const qs: Question[] = ((data.questions ?? []) as Row[]).sort((a, b) => a.position - b.position).map((q) => ({
        ...q, media_url: q.media_url ?? '', points_multiplier: Number(q.points_multiplier),
        options: [...q.options].sort((a, b) => a.position - b.position).map(({ id, label, is_correct }) => ({ id, label, is_correct })),
      }))
      if (qs.length === 0) { qs.push(newQuestion()); setDirty(true) }
      qs.forEach((q) => { if (q.kind === 'multiple_choice') while (q.options.length < 4) q.options.push({ id: uid(), label: '', is_correct: false }) })
      setQuestions(qs); setLoading(false)
    })()
  }, [id, navigate])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const q = questions[current]
  const allProblems = useMemo(() => questions.map(problems), [questions])
  const ready = allProblems.every((p) => p.length === 0)

  function update(patch: Partial<Question>) {
    setQuestions((qs) => qs.map((x, i) => (i === current ? { ...x, ...patch } : x))); setDirty(true); setNotice(null)
  }
  function setOption(i: number, patch: Partial<Option>) {
    update({ options: q.options.map((o, j) => (j === i ? { ...o, ...patch } : patch.is_correct ? { ...o, is_correct: false } : o)) })
  }
  function setKind(kind: Kind) {
    if (kind === q.kind) return
    update({ kind, options: kind === 'true_false' ? tfOptions() : blankOptions() })
  }
  function add() { setQuestions((qs) => [...qs.slice(0, current + 1), newQuestion(), ...qs.slice(current + 1)]); setCurrent(current + 1); setDirty(true) }
  function duplicate() {
    const copy: Question = { ...q, id: uid(), options: q.options.map((o) => ({ ...o, id: uid() })) }
    setQuestions((qs) => [...qs.slice(0, current + 1), copy, ...qs.slice(current + 1)]); setCurrent(current + 1); setDirty(true)
  }
  function remove() {
    if (questions.length === 1) { setQuestions([newQuestion()]); setDirty(true); return }
    setQuestions((qs) => qs.filter((_, i) => i !== current)); setCurrent(Math.max(0, current - 1)); setDirty(true)
  }
  function move(delta: number) {
    const to = current + delta
    if (to < 0 || to >= questions.length) return
    setQuestions((qs) => { const c = [...qs]; [c[current], c[to]] = [c[to], c[current]]; return c }); setCurrent(to); setDirty(true)
  }

  async function save() {
    setSaving(true); setNotice(null)
    const payload = questions.map((x) => ({ ...x, options: x.options.filter((o) => o.label.trim()).map((o) => ({ ...o, label: o.label.trim() })) }))
    let error: unknown = null
    try { await saveQuiz(id!, title.trim() || 'Quiz sem título', payload) } catch (e) { error = e; console.error(e) }
    setSaving(false)
    if (error) setNotice({ kind: 'err', text: 'Não foi possível salvar. Verifique a conexão e tente de novo.' })
    else { setDirty(false); setNotice({ kind: 'ok', text: 'Quiz salvo.' }) }
  }

  if (loading) return <div className="page"><div className="center muted">Carregando quiz…</div></div>

  return (
    <div className="page editor-page">
      <header className="topbar editor-top">
        <Link to="/painel" className="qz-btn qz-btn--ghost" style={{ paddingLeft: 0 }}>← Meus quizzes</Link>
        <input className="input title-input" aria-label="Título do quiz" value={title} maxLength={120}
          onChange={(e) => { setTitle(e.target.value); setDirty(true) }} />
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <span className="muted save-state">{saving ? 'Salvando…' : dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span>
          <button className="qz-btn qz-btn--primary" onClick={save} disabled={saving || !dirty}>Salvar</button>
        </div>
      </header>

      {notice && <p className={`notice notice--${notice.kind} content`} style={{ marginBottom: 16 }}>{notice.text}</p>}

      <div className="content editor">
        <nav className="q-list" aria-label="Perguntas">
          {questions.map((x, i) => (
            <button key={x.id} className={`q-item${i === current ? ' is-active' : ''}`} onClick={() => setCurrent(i)}>
              <span className="q-num">{i + 1}</span>
              <span className="q-text">{x.prompt.trim() || 'Pergunta sem enunciado'}</span>
              {allProblems[i].length > 0 && <span className="q-warn" title={allProblems[i].join(', ')}>!</span>}
            </button>
          ))}
          <button className="qz-btn qz-btn--secondary" onClick={add}>+ Pergunta</button>
        </nav>

        <section className="q-edit card">
          <div className="q-toolbar">
            <strong className="h2">Pergunta {current + 1} de {questions.length}</strong>
            <div className="btn-row">
              <button className="qz-btn qz-btn--ghost" onClick={() => move(-1)} disabled={current === 0} aria-label="Mover para cima">↑</button>
              <button className="qz-btn qz-btn--ghost" onClick={() => move(1)} disabled={current === questions.length - 1} aria-label="Mover para baixo">↓</button>
              <button className="qz-btn qz-btn--ghost" onClick={duplicate}>Duplicar</button>
              {confirmDelete ? (
                <>
                  <button className="qz-btn qz-btn--secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button>
                  <button className="qz-btn qz-btn--danger" onClick={() => { remove(); setConfirmDelete(false) }}>Excluir mesmo</button>
                </>
              ) : (
                <button className="qz-btn qz-btn--ghost" onClick={() => setConfirmDelete(true)}>Excluir</button>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="prompt">Enunciado</label>
            <textarea id="prompt" className="input textarea" maxLength={300} rows={2} value={q.prompt}
              placeholder="Ex.: Qual é a capital do Rio Grande do Norte?" onChange={(e) => update({ prompt: e.target.value })} />
            <span className="muted" style={{ fontSize: 13, justifySelf: 'end' }}>{q.prompt.length}/300{q.prompt.length > 120 ? ' · longo para o telão' : ''}</span>
          </div>

          <div className="settings">
            <div className="field">
              <label htmlFor="kind">Tipo</label>
              <select id="kind" className="input" value={q.kind} onChange={(e) => setKind(e.target.value as Kind)}>
                <option value="multiple_choice">Múltipla escolha</option>
                <option value="true_false">Verdadeiro ou falso</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="time">Tempo</label>
              <select id="time" className="input" value={q.time_limit_s} onChange={(e) => update({ time_limit_s: Number(e.target.value) })}>
                {TIMES.map((t) => <option key={t} value={t}>{t} segundos</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="points">Pontos</label>
              <select id="points" className="input" value={q.points_multiplier} onChange={(e) => update({ points_multiplier: Number(e.target.value) })}>
                <option value={1}>Normal (até 1.000)</option>
                <option value={2}>Dobro (até 2.000)</option>
                <option value={0}>Sem pontos</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Respostas · toque no círculo para marcar a certa</label>
            <div className="opt-grid">
              {q.options.map((o, i) => (
                <div key={o.id} className={`opt qz-answer--${ANSWER[i].key}${o.is_correct ? ' is-correct' : ''}`}>
                  <Shape index={i} />
                  <input className="opt-input" value={o.label} maxLength={120} readOnly={q.kind === 'true_false'}
                    placeholder={`Resposta ${i + 1}${i >= 2 ? ' (opcional)' : ''}`} aria-label={`Resposta ${i + 1}, ${ANSWER[i].label}`}
                    onChange={(e) => setOption(i, { label: e.target.value })} />
                  <button className="opt-check" aria-pressed={o.is_correct} aria-label={`Marcar resposta ${i + 1} como certa`}
                    onClick={() => setOption(i, { is_correct: true })}>
                    {o.is_correct && <svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7" /></svg>}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {allProblems[current].length > 0 && (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>Para jogar esta pergunta: {allProblems[current].join(', ')}.</p>
          )}
        </section>
      </div>
      <p className="content muted" style={{ fontSize: 14, marginTop: 16 }}>
        {ready ? `Pronto para jogar: ${questions.length} perguntas.` : 'Perguntas com ! ainda não estão prontas para jogar. Você pode salvar mesmo assim.'}
      </p>
    </div>
  )
}
