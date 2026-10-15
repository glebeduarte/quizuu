import { ANSWER, Shape } from './shapes'
import type { PollQuestion, WordCount } from './poll'

const COLORS = ['red', 'orange', 'yellow', 'purple'] as const

export function ChoiceResults({ q, counts, mine, size = 'md' }: { q: PollQuestion; counts: number[]; mine?: number | null; size?: 'md' | 'lg' }) {
  const total = counts.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...counts)
  return (
    <div className={`pr-bars pr-${size}`}>
      {q.options.map((o, i) => {
        const pct = total ? Math.round((counts[i] ?? 0) / total * 100) : 0
        const c = COLORS[i % 4]
        return (
          <div key={i} className={`pr-row${mine === i ? ' is-mine' : ''}`}>
            <span className={`pr-shape qz-answer--${c}`}><Shape index={i % 4} /></span>
            <div className="pr-main">
              <div className="pr-label"><span>{o}</span><strong>{pct}%</strong></div>
              <div className="pr-track"><i className={`qz-answer--${c}`} style={{ width: `${((counts[i] ?? 0) / max) * 100}%` }} /></div>
            </div>
            <span className="pr-count">{counts[i] ?? 0}</span>
          </div>
        )
      })}
    </div>
  )
}

export function WordCloud({ words, mine = [], size = 'md' }: { words: WordCount[]; mine?: string[]; size?: 'md' | 'lg' }) {
  if (!words.length) return <p className="pr-empty">As palavras aparecem aqui assim que chegarem.</p>
  const max = Math.max(...words.map((w) => w.n)), min = Math.min(...words.map((w) => w.n))
  const base = size === 'lg' ? [20, 76] : [15, 40]
  // ordem que alterna grandes e pequenas para a nuvem ficar equilibrada
  const sorted = [...words].sort((a, b) => b.n - a.n)
  const arranged: WordCount[] = []
  sorted.forEach((w, i) => (i % 2 ? arranged.push(w) : arranged.unshift(w)))
  return (
    <div className={`pr-cloud pr-${size}`}>
      {arranged.map((w, i) => {
        const t = max === min ? 1 : (w.n - min) / (max - min)
        const fs = base[0] + t * (base[1] - base[0])
        const c = COLORS[(w.w.length + i) % 4]
        return (
          <span key={w.w} className={`pr-word c-${c}${mine.includes(w.w) ? ' is-mine' : ''}`} style={{ fontSize: fs, animationDelay: `${(i % 12) * 40}ms` }} title={`${w.n}`}>
            {w.w}
          </span>
        )
      })}
    </div>
  )
}

export { ANSWER }
