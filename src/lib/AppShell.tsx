import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { usePlano } from './plan'

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

const NAV = [
  { to: '/painel', label: 'Início', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', end: true },
  { to: '/painel/quizzes', label: 'Meus quizzes', icon: 'M4 5h16v14H4zM8 9h8M8 13h5' },
  { to: '/painel/relatorios', label: 'Relatórios', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { to: '/votacoes', label: 'Votações', icon: 'M4 6h10M4 12h16M4 18h7' },
  { to: '/gerar', label: 'Gerar com IA', icon: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z' },
  { to: '/plano', label: 'Meu plano', icon: 'M3 7h18v10H3zM3 11h18M7 15h3' },
]

function Mini({ rotulo, usado, total }: { rotulo: string; usado: number; total: number }) {
  const pct = total ? Math.min(100, (usado / total) * 100) : 0
  return (
    <div className="shell-uso">
      <div><span>{rotulo}</span><strong>{usado}/{total}</strong></div>
      <div className="shell-uso__bar"><div style={{ width: `${pct}%`, background: pct >= 100 ? '#e2332b' : '#ffbe1a' }} /></div>
    </div>
  )
}

export default function AppShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { session } = useAuth()
  const { plano } = usePlano()
  const [admin, setAdmin] = useState(false)
  const [aberto, setAberto] = useState(false)
  const loc = useLocation()
  useEffect(() => { supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true)) }, [])
  useEffect(() => setAberto(false), [loc.pathname])

  return (
    <div className="adm shell">
      <aside className={`adm-side${aberto ? ' aberto' : ''}`}>
        <Link to="/" className="adm-logo"><img src="/logo-wordmark-light.png" alt="Quizuu" /></Link>
        <nav aria-label="Menu principal">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `adm-nav${isActive ? ' on' : ''}`}>
              <Icon d={n.icon} /><span>{n.label}</span>
            </NavLink>
          ))}
          {admin && <NavLink to="/admin" className="adm-nav"><Icon d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><span>Admin</span></NavLink>}
        </nav>
        {plano && plano.plan !== 'admin' && (
          <div className="shell-plano">
            <span className="shell-plano__nome">Plano {plano.plan === 'pro' ? 'Pro' : 'Grátis'}</span>
            <Mini rotulo="Quizzes" usado={plano.quizzes} total={plano.limits.quizzes} />
            <Mini rotulo="Votações" usado={plano.votacoes} total={plano.limits.votacoes} />
            <Mini rotulo={plano.ia.periodo === 'total' ? 'IA (grátis)' : 'IA no mês'} usado={plano.ia.used} total={plano.ia.limit} />
            {plano.plan === 'free' && <Link to="/plano" className="shell-plano__cta">Assinar o Pro</Link>}
          </div>
        )}
        <div className="adm-side__foot">
          <span>{session?.user.email}</span>
          <button className="shell-sair" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </aside>
      {aberto && <button className="adm-veu" aria-label="Fechar menu" onClick={() => setAberto(false)} />}
      <div className="adm-main">
        <header className="adm-top">
          <button className="adm-burger" aria-label="Abrir menu" onClick={() => setAberto(true)}><Icon d="M4 6h16M4 12h16M4 18h16" /></button>
          <h1>{title}</h1>
          <div className="btn-row shell-acoes">{actions}</div>
        </header>
        <div className="adm-body">{children}</div>
      </div>
    </div>
  )
}
