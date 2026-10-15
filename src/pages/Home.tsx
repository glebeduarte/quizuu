import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MotionConfig, motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
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

/* Movimento: valores compartilhados */
const SPRING = { type: 'spring', stiffness: 70, damping: 16, mass: 1 } as const
const EASE_OUT = [0.22, 1, 0.36, 1] as const

/* Revela elementos ao rolar a página (mola + desfoque). Mantém a classe "in" para as animações CSS internas. */
function Reveal({ children, className = '', delay = 0, as = 'div', from = 'up' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'li' | 'section'; from?: 'up' | 'left' | 'right' }) {
  const reduce = useReducedMotion()
  const [on, setOn] = useState(false)
  const start = reduce ? { opacity: 0 } : { opacity: 0, x: from === 'left' ? -120 : from === 'right' ? 120 : 0, y: from === 'up' ? 90 : 30, scale: 0.9, rotate: from === 'left' ? -3 : from === 'right' ? 3 : 0, filter: 'blur(14px)' }
  const Tag = as === 'li' ? motion.li : as === 'section' ? motion.section : motion.div
  return (
    <Tag
      className={`reveal${on ? ' in' : ''} ${className}`}
      initial={start}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, amount: 0.15 }}
      transition={reduce ? { duration: 0.6, delay: delay / 1000 } : { ...SPRING, delay: delay / 1000, opacity: { duration: 0.7, delay: delay / 1000 }, filter: { duration: 0.8, ease: EASE_OUT, delay: delay / 1000 } }}
      onViewportEnter={() => setOn(true)}
    >{children}</Tag>
  )
}

/* Título de seção que entra palavra por palavra */
function Words({ text, className = 'h2x' }: { text: string; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.h2 className={className} initial="hide" whileInView="show" viewport={{ once: true, amount: 0.6 }}
      transition={{ staggerChildren: 0.09, delayChildren: 0.1 }}>
      {text.split(' ').map((w, i) => (
        <motion.span key={i} style={{ display: 'inline-block', whiteSpace: 'pre' }}
          variants={reduce ? { hide: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } } : { hide: { opacity: 0, y: '1.1em', rotate: 8, scale: 0.8, filter: 'blur(6px)' }, show: { opacity: 1, y: 0, rotate: 0, scale: 1, filter: 'blur(0px)', transition: SPRING } }}>
          {w + ' '}
        </motion.span>
      ))}
    </motion.h2>
  )
}

/* Barra de progresso de leitura no topo */
function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 })
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />
}

/* Seção que "abre" ao entrar na tela: cresce e perde as bordas arredondadas */
function Unfold({ children, className }: { children: ReactNode; className: string }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 35%'] })
  const scale = useTransform(scrollYProgress, [0, 1], [0.8, 1])
  const radius = useTransform(scrollYProgress, [0, 1], [80, 0])
  return <motion.section ref={ref} className={className} style={{ scale, borderRadius: radius }}>{children}</motion.section>
}

/* Cena do hero: inclina com o mouse e recua com a rolagem */
function HeroScene() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const mx = useMotionValue(0), my = useMotionValue(0)
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), { stiffness: 120, damping: 16 })
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [10, -10]), { stiffness: 120, damping: 16 })
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 700], [0, 220])
  const sc = useTransform(scrollY, [0, 700], [1, 0.86])
  const op = useTransform(scrollY, [0, 600], [1, 0.35])
  function move(e: React.PointerEvent) {
    if (reduce || e.pointerType !== 'mouse') return
    const r = ref.current!.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5)
  }
  return (
    <motion.div ref={ref} className="hero2-scene" onPointerMove={move} onPointerLeave={() => { mx.set(0); my.set(0) }}
      initial={{ opacity: 0, y: 60, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SPRING, delay: 0.3 }}
      style={{ perspective: 1200 }}>
      <motion.div style={{ rotateX: rotX, rotateY: rotY, y: reduce ? 0 : y, scale: reduce ? 1 : sc, opacity: reduce ? 1 : op, transformStyle: 'preserve-3d' }}>
        <Scene />
      </motion.div>
    </motion.div>
  )
}

/* Formas do fundo do hero com parallax em velocidades diferentes */
function HeroBg() {
  const { scrollY } = useScroll()
  const slow = useTransform(scrollY, [0, 800], [0, -200])
  const fast = useTransform(scrollY, [0, 800], [0, -480])
  return (
    <div className="hero-bg" aria-hidden="true">
      {[0, 1, 2, 3, 0, 1, 2, 3].map((k, n) => (
        <motion.span key={n} className={`bg-shape s${n} qz-answer--${ANSWER[k].key}`} style={{ y: n % 2 ? fast : slow }}><Shape index={k} /></motion.span>
      ))}
    </div>
  )
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
    <MotionConfig reducedMotion="never">
    <div className="home">
      <ScrollProgress />
      <header className={`home-header${scrolled ? ' scrolled' : ''}`}>
        <div className="home-header-in">
          <Link to="/" className="wordmark"><img src="/logo-wordmark.png" alt="Quizuu" /></Link>
          <nav className="home-nav">
            <a href="#como-funciona" className="nav-link">Como funciona</a>
            <a href="#votacoes" className="nav-link">Votações</a>
            <a href="#planos" className="nav-link">Planos</a>
            <Link to="/jogar" className="nav-link">Tenho um PIN</Link>
            {session
              ? <Link to="/painel" className="qz-btn qz-btn--primary">Meus quizzes</Link>
              : <><Link to="/entrar" className="nav-link">Entrar</Link><Link to="/criar-conta" className="qz-btn qz-btn--primary">Criar conta</Link></>}
          </nav>
        </div>
      </header>

      <section className="hero2">
        <HeroBg />
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
          <HeroScene />
        </div>
      </section>

      <div className="marquee" aria-label="Usos comuns">
        <div className="marquee-track">
          {[...USES, ...USES].map((u, n) => <span key={n} className="marquee-item"><Shape index={n % 4} />{u}</span>)}
        </div>
      </div>

      <section id="como-funciona" className="section">
        <div className="section-in">
          <Reveal><span className="kicker">Como funciona</span><Words text="Do zero ao pódio em três passos" /></Reveal>
          <ol className="steps2">
            <Reveal as="li" delay={0} from="left" className="step2">
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
                <div className="mp-qr"><QRCodeSVG value="https://quizuubr.vercel.app/jogar?pin=482913" size={84} marginSize={1} /></div>
                <div className="mp-chips">{['Lara', 'Rafa', 'Prof. Ana', 'Turma 8B', 'Duda'].map((n, k) => <span key={n} style={{ animationDelay: `${k * 260}ms` }}>{n}</span>)}</div>
              </div>
              <span className="step2-n">2</span><h3>Projete o PIN</h3>
              <p>Abra a sala no telão. A turma entra pelo QR code ou digitando o PIN no celular.</p>
            </Reveal>
            <Reveal as="li" delay={240} from="right" className="step2">
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

      <Unfold className="section dark">
        <div className="section-in split">
          <Reveal className="split-copy" from="left">
            <span className="kicker">Telão e celular sincronizados</span>
            <Words text="Cada toque chega ao telão na hora." />
            <p className="lead2">O celular de quem joga mostra só as cores e formas, em tela cheia, para ninguém perder tempo lendo. O relógio que mede a velocidade é o do servidor, então o placar é justo para todos os aparelhos.</p>
            <ul className="ticks">
              <li>Resposta registrada em cerca de 0,2 segundo</li>
              <li>Quem recarregar a página volta para o mesmo lugar</li>
              <li>Apelidos ofensivos são barrados na entrada</li>
            </ul>
          </Reveal>
          <Reveal className="phones" delay={150} from="right">
            <div className="phone small p-left"><div className="phone-screen ph-lobby"><strong>Você está dentro!</strong><span>Procure seu apelido no telão.</span></div></div>
            <div className="phone small p-mid"><div className="phone-screen"><div className="ph-grid static">{ANSWER.map((a, k) => <span key={a.key} className={`ph-btn qz-answer--${a.key}`}><Shape index={k} /></span>)}</div></div></div>
            <div className="phone small p-right"><div className="phone-screen ph-result"><div className="ph-verdict">✓</div><strong>Você acertou!</strong><span className="ph-gain">+985</span></div></div>
          </Reveal>
        </div>
      </Unfold>

      <section className="section" id="votacoes">
        <div className="section-in poll-feature">
          <Reveal className="pf-copy" from="left">
            <span className="kicker">Novo · Votações ao vivo</span>
            <Words text="Sua plateia vota, e o resultado aparece no seu slide." />
            <p className="lead2" style={{ color: 'var(--ink-muted)' }}>Monte uma sequência de perguntas de múltipla escolha ou nuvem de palavras. A plateia vota pelo QR code e o gráfico cresce ao vivo dentro do PowerPoint, enquanto você fala.</p>
            <ul className="ticks">
              <li>Múltipla escolha e nuvem de palavras</li>
              <li>Resultado no telão e no celular de quem votou</li>
              <li>Um slide por pergunta: o slide aparece, a votação muda sozinha</li>
              <li>Palavrões são barrados antes de chegar à tela</li>
            </ul>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <Link to={session ? '/votacoes' : '/criar-conta'} className="qz-btn qz-btn--primary qz-btn--lg">{session ? 'Criar uma votação' : 'Criar conta grátis'}</Link>
            </div>
          </Reveal>
          <Reveal className="pf-visual" delay={150} from="right">
            <div className="pf-slide">
              <div className="pf-bar-top"><span /><span /><span /></div>
              <div className="pf-slide-in">
                <div className="pf-left">
                  <strong className="pf-q">Qual tema você quer aprofundar?</strong>
                  {[['Vendas', 62, 'red', 0], ['Conteúdo', 24, 'orange', 1], ['Gestão', 14, 'yellow', 2]].map(([l, v, c, k]) => (
                    <div key={l as string} className="pf-row">
                      <span className={`pf-shape qz-answer--${c}`}><Shape index={k as number} /></span>
                      <div className="pf-track"><i className={`qz-answer--${c}`} style={{ ['--w' as string]: `${v}%` }} /></div>
                      <b>{v}%</b>
                    </div>
                  ))}
                </div>
                <div className="pf-qr"><QRCodeSVG value="https://quizuubr.vercel.app/v/PALCO1" size={72} marginSize={1} /><span>PALCO1</span></div>
              </div>
            </div>
            <div className="pf-cloud-card">
              <span className="pf-cloud-title">Em uma palavra?</span>
              <div className="pf-cloud">
                {[['curioso', 15, 'purple'], ['animado', 30, 'red'], ['pronto', 18, 'orange'], ['focado', 22, 'yellow'], ['feliz', 14, 'purple'], ['inspirado', 17, 'orange']].map(([w, f, c], i) => (
                  <span key={w as string} className={`pr-word c-${c}`} style={{ fontSize: f as number, animationDelay: `${i * 120}ms` }}>{w}</span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="section-in">
          <div className="stats">
            <Reveal className="stat"><strong><CountUp to={200} /></strong><span>jogadores numa mesma sala, testados ao mesmo tempo</span></Reveal>
            <Reveal className="stat" delay={100}><strong><CountUp to={0.2} decimals={1} suffix=" s" /></strong><span>para a resposta chegar ao servidor</span></Reveal>
            <Reveal className="stat" delay={200}><strong><CountUp to={0} /></strong><span>apps para instalar. Basta o navegador</span></Reveal>
            <Reveal className="stat" delay={300}><strong>R$ <CountUp to={0} /></strong><span>para começar: até 15 quizzes e 15 votações no plano Grátis</span></Reveal>
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="section-in">
          <Reveal><span className="kicker">Para quem é</span><Words text="Feito para quem fala para muita gente" /></Reveal>
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

      <section className="section" id="planos">
        <div className="section-in">
          <Reveal><span className="kicker">Planos</span><Words text="Comece grátis. Assine quando quiser mais IA" />
            <p className="lead2">Partidas e jogadores não têm limite em nenhum plano. O Pro libera a geração de quizzes com IA e mais espaço para guardar seus quizzes e votações.</p></Reveal>
          <div className="price-grid">
            <Reveal className="price-card">
              <h3>Grátis</h3>
              <p className="price-val">R$ 0</p>
              <p className="price-sub">Para testar e usar em turmas e eventos menores.</p>
              <ul>
                <li>Até 15 quizzes</li>
                <li>Até 15 votações ao vivo</li>
                <li>Partidas e jogadores sem limite</li>
                <li>Relatórios e planilha CSV</li>
                <li>3 quizzes gerados com IA para experimentar</li>
              </ul>
              <Link to={session ? '/painel' : '/criar-conta'} className="qz-btn qz-btn--secondary qz-btn--lg">{session ? 'Ir para meus quizzes' : 'Criar conta grátis'}</Link>
            </Reveal>
            <Reveal className="price-card price-card--pro" delay={120}>
              <span className="price-tag">Com IA</span>
              <h3>Pro</h3>
              <p className="price-val">R$ 25<span>/mês</span></p>
              <p className="price-sub">Para quem cria conteúdo toda semana.</p>
              <ul>
                <li>Até 50 quizzes</li>
                <li>Até 50 votações ao vivo</li>
                <li>Partidas e jogadores sem limite</li>
                <li>Relatórios e planilha CSV</li>
                <li><strong>25 quizzes por mês gerados com IA</strong>, a partir de um tema ou de um material seu (PDF, texto ou imagem)</li>
              </ul>
              <Link to={session ? '/plano' : '/criar-conta'} className="qz-btn qz-btn--primary qz-btn--lg">Assinar o Pro</Link>
              <p className="price-note">Pagamento pelo Stripe. Cancele quando quiser, sem multa.</p>
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

      <footer className="footer3">
        <div className="section-in">
          <div className="f3-grid">
            <div className="f3-brand">
              <img src="/logo-wordmark.png" alt="Quizuu" className="f3-logo" />
              <p>Quiz e votações ao vivo para escolas e eventos. Projete no telão ou no seu slide e coloque a sala inteira para participar pelo celular.</p>
              <div className="f3-shapes" aria-hidden="true">{ANSWER.map((a, k) => <span key={a.key} className={`qz-answer--${a.key}`}><Shape index={k} /></span>)}</div>
            </div>
            <nav className="f3-col" aria-label="Produto">
              <h4>Produto</h4>
              <a href="#como-funciona">Como funciona</a>
              <a href="#votacoes">Votações ao vivo</a>
              <a href="#planos">Planos</a>
              <Link to="/criar-conta">Criar conta grátis</Link>
              <Link to="/entrar">Entrar</Link>
            </nav>
            <nav className="f3-col" aria-label="Para jogar">
              <h4>Para jogar</h4>
              <Link to="/jogar">Entrar com PIN</Link>
              <span>Sem app para instalar</span>
              <span>Funciona em qualquer celular</span>
            </nav>
            <div className="f3-col">
              <h4>Criado por</h4>
              <a href="https://glebeduarte.com.br" target="_blank" rel="noopener" className="f3-author">
                <strong>Glebe Duarte</strong>
                <span>glebeduarte.com.br ↗</span>
              </a>
            </div>
          </div>
          <div className="f3-bottom">
            <span>© {new Date().getFullYear()} Quizuu. Gratuito para escolas e eventos.</span>
            <span>Feito em Natal, RN, por <a href="https://glebeduarte.com.br" target="_blank" rel="noopener">Glebe Duarte</a></span>
          </div>
        </div>
      </footer>
    </div>
    </MotionConfig>
  )
}
