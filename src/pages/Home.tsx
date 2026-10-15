import { Link } from 'react-router-dom'
import { ANSWER, Shape } from '../lib/shapes'

const SAMPLE = ['Natal', 'Mossoró', 'Parnamirim', 'Caicó']

export default function Home() {
  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="wordmark">Quizuu</Link>
        <Link to="/entrar">Sou organizador</Link>
      </header>
      <main className="content hero">
        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
          <h1>Quiz ao vivo para eventos e escolas.</h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: '46ch', margin: 0 }}>
            Projete as perguntas no telão. A plateia responde pelo celular. Ganha quem acerta mais rápido.
          </p>
          <div className="btn-row">
            <Link to="/jogar" className="qz-btn qz-btn--primary" style={{ textDecoration: 'none' }}>Entrar com PIN</Link>
            <Link to="/entrar" className="qz-btn qz-btn--secondary" style={{ textDecoration: 'none' }}>Criar um quiz</Link>
          </div>
        </div>
        <div className="qz-stage" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, font: '800 24px/30px var(--font-display)' }}>Qual é a capital do Rio Grande do Norte?</p>
          <div className="qz-answers">
            {ANSWER.map((a, i) => (
              <div key={a.key} className={`qz-answer qz-answer--${a.key}`}>
                <Shape index={i} />{SAMPLE[i]}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
