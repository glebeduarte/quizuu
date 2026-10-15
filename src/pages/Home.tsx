import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ANSWER, Shape } from '../lib/shapes'
import { useAuth } from '../lib/auth'

const DEMO = [
  { prompt: 'Qual é a capital do Rio Grande do Norte?', options: ['Natal', 'Mossoró', 'Parnamirim', 'Caicó'], correct: 0 },
  { prompt: 'Quantos lados tem um hexágono?', options: ['5', '8', '6', '7'], correct: 2 },
  { prompt: 'Qual planeta é conhecido como planeta vermelho?', options: ['Vênus', 'Júpiter', 'Saturno', 'Marte'], correct: 3 },
]

function Demo() {
  const [i, setI] = useState(0)
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => {
      if (!revealed) setRevealed(true)
      else { setRevealed(false); setI((i + 1) % DEMO.length) }
    }, revealed ? 2200 : 3200)
    return () => clearTimeout(t)
  }, [i, revealed])
  const q = DEMO[i]
  return (
    <div className="qz-stage demo" aria-label="Exemplo de pergunta no telão">
      <div className="demo-top"><span className="demo-pin">PIN 482 913</span><span className="demo-count">{revealed ? 'Resposta' : '24 respostas'}</span></div>
      <p className="demo-prompt">{q.prompt}</p>
      <div className="qz-answers">
        {q.options.map((label, k) => (
          <div key={k} className={`qz-answer qz-answer--${ANSWER[k].key}${revealed && k !== q.correct ? ' is-dimmed' : ''}`}>
            <Shape index={k} />{label}
            {revealed && k === q.correct && <span className="qz-mark"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7" /></svg></span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const { session } = useAuth()
  const primary = session ? { to: '/painel', label: 'Ir para meus quizzes' } : { to: '/criar-conta', label: 'Criar conta grátis' }
  return (
    <div className="home">
      <div className="page home-hero-wrap">
        <header className="topbar">
          <Link to="/" className="wordmark"><picture><source srcSet="/logo-wordmark-light.png" media="(prefers-color-scheme: dark)" /><img src="/logo-wordmark.png" alt="Quizuu" /></picture></Link>
          <nav className="btn-row home-nav">
            <Link to="/jogar" className="qz-btn qz-btn--ghost">Tenho um PIN</Link>
            {session
              ? <Link to="/painel" className="qz-btn qz-btn--secondary">Meus quizzes</Link>
              : <><Link to="/entrar" className="qz-btn qz-btn--ghost">Entrar</Link><Link to="/criar-conta" className="qz-btn qz-btn--primary">Criar conta</Link></>}
          </nav>
        </header>
        <main className="content hero">
          <div className="hero-copy">
            <span className="eyebrow">Gratuito para escolas e eventos</span>
            <h1>Quiz ao vivo que coloca a sala inteira para jogar.</h1>
            <p className="lead">Você projeta as perguntas no telão. A plateia responde pelo celular, sem baixar nada. Ganha quem acerta mais rápido.</p>
            <div className="btn-row">
              <Link to={primary.to} className="qz-btn qz-btn--primary qz-btn--lg">{primary.label}</Link>
              <Link to="/jogar" className="qz-btn qz-btn--secondary qz-btn--lg">Entrar com PIN</Link>
            </div>
          </div>
          <Demo />
        </main>
      </div>

      <section className="band">
        <div className="content">
          <h2 className="section-title">Como funciona</h2>
          <ol className="steps">
            <li><span className="step-n">1</span><h3>Monte o quiz</h3><p>Escreva as perguntas, marque a resposta certa e defina o tempo de cada uma.</p></li>
            <li><span className="step-n">2</span><h3>Projete o PIN</h3><p>Abra a sala no telão. A turma entra pelo QR code ou digitando o PIN no celular.</p></li>
            <li><span className="step-n">3</span><h3>Jogue ao vivo</h3><p>Cada pergunta revela quem acertou. No fim, o pódio mostra os três mais rápidos.</p></li>
          </ol>
        </div>
      </section>

      <section className="content audiences">
        <div className="audience">
          <h3>Na sala de aula</h3>
          <p>Revise o conteúdo antes da prova, abra a aula com uma pergunta provocadora ou feche a semana com um desafio entre turmas.</p>
        </div>
        <div className="audience">
          <h3>Em eventos e palestras</h3>
          <p>Aqueça a plateia, teste o que ficou da palestra e anime o intervalo. Funciona com dezenas de pessoas na mesma sala.</p>
        </div>
      </section>

      <section className="content features">
        {[
          ['Sem cadastro para jogar', 'Quem joga só digita o PIN e um apelido.'],
          ['Tempo justo', 'A velocidade é medida no servidor, igual para todos os celulares.'],
          ['Feito para o telão', 'Letras grandes, cores fortes e formas que se reconhecem de longe.'],
          ['Gratuito', 'Crie quantos quizzes quiser e jogue sem pagar nada.'],
        ].map(([t, d]) => <div key={t} className="feature"><h3>{t}</h3><p>{d}</p></div>)}
      </section>

      <section className="content cta-final">
        <h2>Pronto para a primeira rodada?</h2>
        <Link to={primary.to} className="qz-btn qz-btn--primary qz-btn--lg">{primary.label}</Link>
      </section>

      <footer className="content footer">
        <img src="/logo-mark.png" alt="" width="28" height="28" />
        <span className="muted">Quizuu · quiz ao vivo para escolas e eventos</span>
      </footer>
    </div>
  )
}
