import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { ANSWER, Shape } from '../lib/shapes'
import { useAuth } from '../lib/auth'
import '../home.css'

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const DEMO = [
  { prompt: 'Qual é a capital do Rio Grande do Norte?', options: ['Natal', 'Mossoró', 'Parnamirim', 'Caicó'], correct: 0, votes: [18, 4, 2, 0] },
  { prompt: 'Quantos lados tem um hexágono?', options: ['5', '8', '6', '7'], correct: 2, votes: [3, 1, 19, 1] },
  { prompt: 'Qual planeta é conhecido como planeta vermelho?', options: ['Vênus', 'Júpiter', 'Saturno', 'Marte'], correct: 3, votes: [2, 1, 1, 20] },
]

/* Ciclo da cena: pergunta (com contagem e toque no celular) → revelação → próxima */
function useDemoCycle() {
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'question' | 'tapped' | 'reveal'>('question')
  const [count, setCount] = useState(0)
  const [time, setTime] = useState(20)
  useEffect(() => {
    if (reduced()) { setPhase('reveal'); setCount(24); return }
    let alive = true
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), ms))
    setPhase('question'); setCount(0); setTime(20)
    for (let k = 1; k <= 24; k++) at(150 + k * 95, () => setCount(k))
    for (let k = 1; k <= 6; k++) at(k * 520, () => setTime(20 - k))
    at(1400, () => setPhase('tapped'))
    at(3400, () => setPhase('reveal'))
    at(6200, () => setI((x) => (x + 1) % DEMO.length))
    return () => { alive = false; timers.forEach(clearTimeout) }
  }, [i])
  return { q: DEMO[i], phase, count, time }
}

function Check() { return <span className="qz-mark"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7" /></svg></span> }

function Scene() {
  const { q, phase, count, time } = useDemoCycle()
  const revealed = phase === 'reveal'
  const max = Math.max(...q.votes)
  const c = 2 * Math.PI * 15
  return (
    <div className="scene" aria-label="Demonstração: pergunta no telão e resposta no celular">
      <div className="tv">
        <div className="tv-screen">
          <div className="tv-top">
            <div className="mini-timer">
              <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" className="mt-track" /><circle cx="18" cy="18" r="15" className="mt-ring" strokeDasharray={c} strokeDashoffset={c * (1 - time / 20)} /></svg>
              <span>{time}</span>
            </div>
            <p key={q.prompt} className="tv-prompt">{q.prompt}</p>
            <div className="tv-count"><strong>{count}</strong><span>respostas</span></div>
          </div>
          <div className={`tv-bars${revealed ? ' show' : ''}`} aria-hidden="true">
            {q.votes.map((v, k) => (
              <div key={k} className="tv-bar-col">
                <span className={`tv-bar qz-answer--${ANSWER[k].key}`} style={{ height: revealed ? `${10 + (v / max) * 46}px` : '4px' }} />
              </div>
            ))}
          </div>
          <div className="tv-answers">
            {q.options.map((label, k) => (
              <div key={`${q.prompt}-${k}`} className={`tv-answer qz-answer--${ANSWER[k].key}${revealed && k !== q.correct ? ' is-dimmed' : ''}${revealed && k === q.correct ? ' is-correct' : ''}`} style={{ animationDelay: `${k * 70}ms` }}>
                <Shape index={k} /><span>{label}</span>{revealed && k === q.correct && <Check />}
              </div>
            ))}
          </div>
        </div>
        <div className="tv-stand" />
      </div>

      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          {phase === 'reveal' ? (
            <div className="ph-result" key={`r-${q.prompt}`}>
              <div className="ph-verdict">✓</div>
              <strong>Você acertou!</strong>
              <span className="ph-gain">+985</span>
              <span className="ph-rank">1º lugar de 24</span>
            </div>
          ) : (
            <div className="ph-grid" key={`g-${q.prompt}`}>
              {ANSWER.map((a, k) => (
                <span key={a.key} className={`ph-btn qz-answer--${a.key}${phase === 'tapped' && k === q.correct ? ' tapped' : ''}${phase === 'tapped' && k !== q.correct ? ' faded' : ''}`}>
                  <Shape index={k} />
                  {phase === 'tapped' && k === q.correct && <i className="ripple" />}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="float-chip chip-a">⚡ 0,6 s</div>
      <div className="float-chip chip-b">24 jogando</div>
    </div>
  )
}

/* Revela elementos ao rolar a página */
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'li' | 'section' }) {
  const ref = useRef<HTMLElement | null>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || reduced() || !('IntersectionObserver' in window)) { setOn(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <Tag ref={ref as never} className={`reveal${on ? ' in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</Tag>
}

function CountUp({ to, suffix = '', decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [v, setV] = useState(0)
  useEffect(() => {
    if (reduced() || !('IntersectionObserver' in window)) { setV(to); return }
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const start = performance.now()
      const step = (t: number) => { const p = Math.min(1, (t - start) / 1400); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step) }
      raf = requestAnimationFrame(step)
    }, { threshold: 0.4 })
    if (ref.current) io.observe(ref.current)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [to])
  return <span ref={ref}>{v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
}

const USES = ['Revisão para a prova', 'Abertura de palestra', 'Gincana entre turmas', 'Treinamento de equipe', 'Feira de ciências', 'Intervalo de evento', 'Quiz de boas-vindas', 'Encerramento de semestre']

export default function Home() {
  const { session } = useAuth()
  const primary = session ? { to: '/painel', label: 'Ir para meus quizzes' } : { to: '/criar-conta', label: 'Criar conta grátis' }
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  return (
    <div className="home">
      <header className={`home-header${scrolled ? ' scrolled' : ''}`}>
        <div className="home-header-in">
          <Link to="/" className="wordmark"><picture><source srcSet="/logo-wordmark-light.png" media="(prefers-color-scheme: dark)" /><img src="/logo-wordmark.png" alt="Quizuu" /></picture></Link>
          <nav className="home-nav">
            <a href="#como-funciona" className="nav-link">Como funciona</a>
            <Link to="/jogar" className="nav-link">Tenho um PIN</Link>
            {session
              ? <Link to="/painel" className="qz-btn qz-btn--primary">Meus quizzes</Link>
              : <><Link to="/entrar" className="nav-link">Entrar</Link><Link to="/criar-conta" className="qz-btn qz-btn--primary">Criar conta</Link></>}
          </nav>
        </div>
      </header>

      <section className="hero2">
        <div className="hero-bg" aria-hidden="true">
          {[0, 1, 2, 3, 0, 1, 2, 3].map((k, n) => <span key={n} className={`bg-shape s${n} qz-answer--${ANSWER[k].key}`}><Shape index={k} /></span>)}
        </div>
        <div className="hero2-in">
          <div className="hero2-copy">
            <span className="pill-badge"><i /> Gratuito para escolas e eventos</span>
            <h1 className="hero2-title">
              {['Quiz', 'ao', 'vivo', 'que', 'coloca', 'a', 'sala', 'inteira', 'para', 'jogar.'].map((w, n) => (
                <span key={n} className={`word${['inteira', 'jogar.'].includes(w) ? ' hl' : ''}`} style={{ animationDelay: `${120 + n * 55}ms` }}>{w} </span>
              ))}
            </h1>
            <p className="hero2-lead fade-up" style={{ animationDelay: '700ms' }}>
              Você projeta as perguntas no telão. A plateia responde pelo celular, sem baixar nada. Ganha quem acerta mais rápido.
            </p>
            <div className="hero2-cta fade-up" style={{ animationDelay: '850ms' }}>
              <Link to={primary.to} className="qz-btn qz-btn--primary qz-btn--lg">{primary.label}</Link>
              <Link to="/jogar" className="qz-btn qz-btn--secondary qz-btn--lg">Entrar com PIN</Link>
            </div>
            <ul className="hero2-proof fade-up" style={{ animationDelay: '1000ms' }}>
              <li>Sem app para instalar</li><li>Até 200 por sala</li><li>Pronto em minutos</li>
            </ul>
          </div>
          <div className="hero2-scene fade-in" style={{ animationDelay: '300ms' }}><Scene /></div>
        </div>
      </section>

      <div className="marquee" aria-label="Usos comuns">
        <div className="marquee-track">
          {[...USES, ...USES].map((u, n) => <span key={n} className="marquee-item"><Shape index={n % 4} />{u}</span>)}
        </div>
      </div>

      <section id="como-funciona" className="section">
        <div className="section-in">
          <Reveal><span className="kicker">Como funciona</span><h2 className="h2x">Do zero ao pódio em três passos</h2></Reveal>
          <ol className="steps2">
            <Reveal as="li" delay={0} className="step2">
              <div className="mock mock-editor">
                <div className="me-title">Revisão de quinta</div>
                <div className="me-q">Qual é a capital do RN?</div>
                <div className="me-opts">{['Natal', 'Mossoró', 'Caicó', 'Parnamirim'].map((o, k) => <span key={k} className={`me-opt qz-answer--${ANSWER[k].key}`}><Shape index={k} />{o}{k === 0 && <b className="me-ok">✓</b>}</span>)}</div>
                <div className="me-meta"><span>20 segundos</span><span>Pontos normais</span></div>
              </div>
              <span className="step2-n">1</span><h3>Monte o quiz</h3>
              <p>Escreva as perguntas, marque a certa e escolha o tempo. Múltipla escolha ou verdadeiro e falso.</p>
            </Reveal>
            <Reveal as="li" delay={120} className="step2">
              <div className="mock mock-pin">
                <div className="mp-card"><small>PIN do jogo</small><strong>482 913</strong></div>
                <div className="mp-qr"><QRCodeSVG value="https://quizuu-beryl.vercel.app/jogar?pin=482913" size={84} marginSize={1} /></div>
                <div className="mp-chips">{['Lara', 'Rafa', 'Prof. Ana', 'Turma 8B', 'Duda'].map((n, k) => <span key={n} style={{ animationDelay: `${k * 260}ms` }}>{n}</span>)}</div>
              </div>
              <span className="step2-n">2</span><h3>Projete o PIN</h3>
              <p>Abra a sala no telão. A turma entra pelo QR code ou digitando o PIN no celular.</p>
            </Reveal>
            <Reveal as="li" delay={240} className="step2">
              <div className="mock mock-podium">
                {[{ n: 'Rafa', p: 2, h: 52 }, { n: 'Lara', p: 1, h: 78 }, { n: 'Ana', p: 3, h: 36 }].map((x) => (
                  <div key={x.n} className={`mpo-col p${x.p}`}><span>{x.n}</span><i style={{ height: x.h }}>{x.p}º</i></div>
                ))}
              </div>
              <span className="step2-n">3</span><h3>Jogue ao vivo</h3>
              <p>Cada pergunta revela quem acertou. No final, o pódio mostra os três mais rápidos.</p>
            </Reveal>
          </ol>
        </div>
      </section>

      <section className="section dark">
        <div className="section-in split">
          <Reveal className="split-copy">
            <span className="kicker">Telão e celular sincronizados</span>
            <h2 className="h2x">Cada toque chega ao telão na hora.</h2>
            <p className="lead2">O celular de quem joga mostra só as cores e formas, em tela cheia, para ninguém perder tempo lendo. O relógio que mede a velocidade é o do servidor, então o placar é justo para todos os aparelhos.</p>
            <ul className="ticks">
              <li>Resposta registrada em cerca de 0,2 segundo</li>
              <li>Quem recarregar a página volta para o mesmo lugar</li>
              <li>Apelidos ofensivos são barrados na entrada</li>
            </ul>
          </Reveal>
          <Reveal className="phones" delay={150}>
            <div className="phone small p-left"><div className="phone-screen ph-lobby"><strong>Você está dentro!</strong><span>Procure seu apelido no telão.</span></div></div>
            <div className="phone small p-mid"><div className="phone-screen"><div className="ph-grid static">{ANSWER.map((a, k) => <span key={a.key} className={`ph-btn qz-answer--${a.key}`}><Shape index={k} /></span>)}</div></div></div>
            <div className="phone small p-right"><div className="phone-screen ph-result"><div className="ph-verdict">✓</div><strong>Você acertou!</strong><span className="ph-gain">+985</span></div></div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="section-in">
          <div className="stats">
            <Reveal className="stat"><strong><CountUp to={200} /></strong><span>jogadores numa mesma sala, testados ao mesmo tempo</span></Reveal>
            <Reveal className="stat" delay={100}><strong><CountUp to={0.2} decimals={1} suffix=" s" /></strong><span>para a resposta chegar ao servidor</span></Reveal>
            <Reveal className="stat" delay={200}><strong><CountUp to={0} /></strong><span>apps para instalar. Basta o navegador</span></Reveal>
            <Reveal className="stat" delay={300}><strong>R$ <CountUp to={0} /></strong><span>para criar e jogar quantos quizzes quiser</span></Reveal>
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="section-in">
          <Reveal><span className="kicker">Para quem é</span><h2 className="h2x">Feito para quem fala para muita gente</h2></Reveal>
          <div className="aud2">
            <Reveal className="aud2-card" delay={0}>
              <div className="aud2-icon qz-answer--red"><Shape index={0} /></div>
              <h3>Professores e escolas</h3>
              <p>Revise o conteúdo antes da prova, abra a aula com uma pergunta provocadora ou feche a semana com um desafio entre turmas. O relatório mostra quais perguntas a turma mais errou.</p>
            </Reveal>
            <Reveal className="aud2-card" delay={120}>
              <div className="aud2-icon qz-answer--purple"><Shape index={3} /></div>
              <h3>Eventos e palestras</h3>
              <p>Aqueça a plateia, teste o que ficou da apresentação e anime o intervalo. O QR code no telão leva cada pessoa direto para a sala.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="cta3">
        <div className="cta3-bg" aria-hidden="true">{[0, 1, 2, 3, 1, 2].map((k, n) => <span key={n} className={`cf c${n} qz-answer--${ANSWER[k].key}`}><Shape index={k} /></span>)}</div>
        <Reveal className="cta3-in">
          <h2>Pronto para a primeira rodada?</h2>
          <p>Crie sua conta, monte um quiz curto e teste com quem estiver por perto.</p>
          <Link to={primary.to} className="qz-btn qz-btn--stage qz-btn--lg">{primary.label}</Link>
        </Reveal>
      </section>

      <footer className="footer2">
        <div className="section-in footer2-in">
          <div className="f-brand"><img src="/logo-mark.png" alt="" width="32" height="32" /><span>Quizuu</span></div>
          <span className="muted">Quiz ao vivo para escolas e eventos</span>
          <nav className="f-links"><Link to="/jogar">Entrar com PIN</Link><Link to="/entrar">Entrar</Link><Link to="/criar-conta">Criar conta</Link></nav>
        </div>
      </footer>
    </div>
  )
}
