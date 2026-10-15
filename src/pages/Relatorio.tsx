import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ANSWER, Shape } from '../lib/shapes'
import { formatPoints } from '../lib/game'

type Option = { id: string; label: string; is_correct: boolean; position: number }
type Question = { id: string; prompt: string; position: number; options: Option[] }
type Player = { id: string; nickname: string; score: number; correct_time_ms: number; kicked: boolean }
type Answer = { player_id: string; question_id: string; option_id: string | null; elapsed_ms: number; is_correct: boolean; points: number }

const sec = (ms: number) => `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
const pct = (n: number) => `${Math.round(n * 100)}%`

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click(); URL.revokeObjectURL(url)
}

export default function Relatorio() {
  const { sessionId } = useParams()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const [s, p, a] = await Promise.all([
        supabase.from('sessions').select('created_at, quizzes(title, questions(id,prompt,position, options(id,label,is_correct,position)))').eq('id', sessionId!).single(),
        supabase.from('players').select('id,nickname,score,correct_time_ms,kicked').eq('session_id', sessionId!),
        supabase.from('answers').select('player_id,question_id,option_id,elapsed_ms,is_correct,points').eq('session_id', sessionId!),
      ])
      if (s.error || !s.data) { setError('Relatório não encontrado.'); return }
      const quiz = s.data.quizzes as unknown as { title: string; questions: Question[] }
      setTitle(quiz.title)
      setDate(new Date(s.data.created_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }))
      const answered = new Set((a.data ?? []).map((x) => x.question_id))
      setQuestions(quiz.questions.filter((q) => answered.has(q.id)).sort((x, y) => x.position - y.position)
        .map((q) => ({ ...q, options: [...q.options].sort((x, y) => x.position - y.position) })))
      setPlayers(((p.data ?? []) as Player[]).filter((x) => !x.kicked).sort((x, y) => y.score - x.score || x.correct_time_ms - y.correct_time_ms))
      setAnswers((a.data ?? []) as Answer[])
    })()
  }, [sessionId])

  const qStats = questions.map((q) => {
    const as = answers.filter((a) => a.question_id === q.id)
    const right = as.filter((a) => a.is_correct)
    return {
      q, answered: as.length, right: right.length,
      rate: players.length ? right.length / players.length : 0,
      avg: right.length ? right.reduce((t, a) => t + a.elapsed_ms, 0) / right.length : 0,
      counts: q.options.map((o) => as.filter((a) => a.option_id === o.id).length),
    }
  })
  const pStats = players.map((pl, i) => {
    const as = answers.filter((a) => a.player_id === pl.id)
    const right = as.filter((a) => a.is_correct)
    return { pl, rank: i + 1, right: right.length, avg: right.length ? pl.correct_time_ms / right.length : 0 }
  })
  const overall = qStats.length ? qStats.reduce((t, s) => t + s.rate, 0) / qStats.length : 0
  const hardest = [...qStats].sort((a, b) => a.rate - b.rate)[0]

  function exportPlayers() {
    downloadCsv(`quizuu-jogadores.csv`, [['Posição', 'Apelido', 'Pontos', 'Acertos', 'Perguntas', 'Tempo médio dos acertos (s)'],
      ...pStats.map((s) => [s.rank, s.pl.nickname, s.pl.score, s.right, questions.length, (s.avg / 1000).toFixed(1).replace('.', ',')])])
  }
  function exportQuestions() {
    downloadCsv(`quizuu-perguntas.csv`, [['Nº', 'Pergunta', 'Resposta certa', 'Acertos', 'Jogadores', '% de acerto', 'Tempo médio dos acertos (s)'],
      ...qStats.map((s, i) => [i + 1, s.q.prompt, s.q.options.find((o) => o.is_correct)?.label ?? '', s.right, players.length, Math.round(s.rate * 100), (s.avg / 1000).toFixed(1).replace('.', ',')])])
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/painel" className="qz-btn qz-btn--ghost" style={{ paddingLeft: 0 }}>← Meus quizzes</Link>
      </header>
      <main className="content report">
        {error ? <p className="notice notice--err">{error}</p> : (
          <>
            <div className="report-head">
              <div><span className="eyebrow">Relatório da partida</span><h1>{title}</h1><p className="muted" style={{ margin: 0 }}>{date}</p></div>
              <div className="btn-row">
                <button className="qz-btn qz-btn--secondary" onClick={exportPlayers} disabled={!players.length}>Planilha de jogadores</button>
                <button className="qz-btn qz-btn--secondary" onClick={exportQuestions} disabled={!questions.length}>Planilha de perguntas</button>
              </div>
            </div>

            <div className="kpis">
              <div className="kpi"><strong>{players.length}</strong><span>jogadores</span></div>
              <div className="kpi"><strong>{questions.length}</strong><span>perguntas jogadas</span></div>
              <div className="kpi"><strong>{pct(overall)}</strong><span>de acerto médio</span></div>
              <div className="kpi"><strong>{hardest ? `Nº ${qStats.indexOf(hardest) + 1}` : '–'}</strong><span>pergunta mais difícil</span></div>
            </div>

            <section className="card report-section">
              <h2>Perguntas</h2>
              {qStats.map((s, i) => (
                <div key={s.q.id} className="rq">
                  <div className="rq-head">
                    <span className="q-num">{i + 1}</span>
                    <p className="rq-prompt">{s.q.prompt}</p>
                    <span className={`rq-rate ${s.rate >= .7 ? 'good' : s.rate >= .4 ? 'mid' : 'low'}`}>{pct(s.rate)}</span>
                  </div>
                  <div className="rq-opts">
                    {s.q.options.map((o, k) => (
                      <div key={o.id} className={`rq-opt${o.is_correct ? ' is-correct' : ''}`}>
                        <span className={`rq-shape qz-answer--${ANSWER[k].key}`}><Shape index={k} /></span>
                        <span className="rq-label">{o.label}{o.is_correct && ' ✓'}</span>
                        <span className="rq-bar"><i className={`qz-answer--${ANSWER[k].key}`} style={{ width: `${players.length ? (s.counts[k] / players.length) * 100 : 0}%` }} /></span>
                        <span className="rq-count">{s.counts[k]}</span>
                      </div>
                    ))}
                  </div>
                  <p className="muted rq-meta">{s.right} de {players.length} acertaram{s.right ? ` · tempo médio ${sec(s.avg)}` : ''} · {players.length - s.answered} sem resposta</p>
                </div>
              ))}
            </section>

            <section className="card report-section">
              <h2>Jogadores</h2>
              <div className="table-wrap">
                <table className="rtable">
                  <thead><tr><th>#</th><th>Apelido</th><th className="num">Pontos</th><th className="num">Acertos</th><th className="num">Tempo médio</th></tr></thead>
                  <tbody>
                    {pStats.map((s) => (
                      <tr key={s.pl.id}>
                        <td>{s.rank}</td><td>{s.pl.nickname}</td><td className="num">{formatPoints(s.pl.score)}</td>
                        <td className="num">{s.right}/{questions.length}</td><td className="num">{s.right ? sec(s.avg) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
