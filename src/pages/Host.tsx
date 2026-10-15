import { Link } from 'react-router-dom'

export default function Host() {
  return (
    <div className="page on-stage">
      <header className="topbar"><Link to="/painel" className="wordmark">Quizuu</Link></header>
      <main className="center">
        <div className="qz-pin">
          <span className="qz-pin__label">PIN do jogo</span>
          <span className="qz-pin__code">000 000</span>
          <span className="qz-pin__hint">A sala ao vivo chega numa próxima etapa</span>
        </div>
      </main>
    </div>
  )
}
