import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import AdminIA from './AdminIA'

type Totais = Record<string, number>
type Dia = { dia: string; cadastros: number; partidas: number; jogadores: number; votos: number; ia: number }
type Usuario = {
  id: string; email: string; criado: string; ultimo_login: string | null; admin: boolean
  quizzes: number; partidas: number; jogadores: number; votacoes: number; votos: number; ia: number; pontos: number
}
type Assinatura = { user_id: string; email: string; status: string; fim: string | null; cancela: boolean; atualizado: string; customer: string | null; plano: string }
type Dados = { totais: Totais; diario: Dia[]; usuarios: Usuario[] }

const n = (v: number) => (v ?? 0).toLocaleString('pt-BR')
const dataHora = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca'
const dataCurta = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const PRECO_PRO = 25

const SERIES: { key: keyof Omit<Dia, 'dia'>; label: string; cor: string }[] = [
  { key: 'cadastros', label: 'Cadastros', cor: '#7a2fe0' },
  { key: 'partidas', label: 'Partidas', cor: '#e8620c' },
  { key: 'jogadores', label: 'Jogadores', cor: '#e2332b' },
  { key: 'votos', label: 'Votos', cor: '#c48a00' },
  { key: 'ia', label: 'Gerações IA', cor: '#3d1278' },
]

const STATUS: Record<string, string> = {
  active: 'Ativa', trialing: 'Em teste', past_due: 'Pagamento pendente', canceled: 'Cancelada',
  unpaid: 'Não paga', incomplete: 'Incompleta', incomplete_expired: 'Expirada', inactive: 'Sem assinatura',
}

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
const MENU: { id: string; label: string; icon: string }[] = [
  { id: 'visao-geral', label: 'Visão geral', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  { id: 'contas', label: 'Contas', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8' },
  { id: 'assinaturas', label: 'Assinaturas', icon: 'M3 7h18v10H3zM3 11h18M7 15h3' },
  { id: 'uso', label: 'Uso dos recursos', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'ia', label: 'IA (Gemini)', icon: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z' },
]

export function useIsAdmin() {
  const { session } = useAuth()
  const [admin, setAdmin] = useState<boolean | null>(null)
  useEffect(() => {
    if (!session) { setAdmin(false); return }
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true))
  }, [session])
  return admin
}

function Grafico({ dias, serie }: { dias: Dia[]; serie: keyof Omit<Dia, 'dia'> }) {
  const max = Math.max(1, ...dias.map((d) => d[serie]))
  const cor = SERIES.find((s) => s.key === serie)!.cor
  return <>
    <div className="admin-chart">
      {dias.map((d) => (
        <div key={d.dia} className="admin-col" title={`${new Date(d.dia + 'T12:00').toLocaleDateString('pt-BR')}: ${d[serie]}`}>
          <div style={{ height: `${(d[serie] / max) * 100}%`, background: cor }} />
        </div>
      ))}
    </div>
    <div className="admin-eixo muted"><span>{dias[0] && new Date(dias[0].dia + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span><span>hoje</span></div>
  </>
}

function Kpi({ valor, rotulo, destaque }: { valor: ReactNode; rotulo: string; destaque?: boolean }) {
  return <div className={`kpi${destaque ? ' kpi--destaque' : ''}`}><strong>{valor}</strong><span>{rotulo}</span></div>
}

export default function Admin() {
  const { session } = useAuth()
  const isAdmin = useIsAdmin()
  const { secao = 'visao-geral' } = useParams()
  const [dados, setDados] = useState<Dados | null>(null)
  const [subs, setSubs] = useState<Assinatura[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [serie, setSerie] = useState<keyof Omit<Dia, 'dia'>>('cadastros')
  const [menuAberto, setMenuAberto] = useState(false)

  // Contas
  const [busca, setBusca] = useState('')
  const [filtroPlano, setFiltroPlano] = useState<'todos' | 'pro' | 'free' | 'admin'>('todos')
  const [ordem, setOrdem] = useState<'pontos' | 'criado' | 'ultimo_login'>('criado')
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const [senha, setSenha] = useState('')
  const [confirmaExcluir, setConfirmaExcluir] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirmaLote, setConfirmaLote] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  async function carregar() {
    const [{ data, error }, s] = await Promise.all([supabase.rpc('admin_overview'), supabase.rpc('admin_subscriptions')])
    if (error) { setErro('Não foi possível carregar os dados.'); return }
    setDados(data as Dados)
    setSubs(((s.data as Assinatura[]) ?? []))
  }
  useEffect(() => { if (isAdmin) carregar() }, [isAdmin])
  useEffect(() => { setMenuAberto(false); setAviso(''); setErro('') }, [secao])

  const planoDe = useMemo(() => {
    const m = new Map<string, string>()
    subs.forEach((s) => m.set(s.user_id, s.plano))
    return (u: Usuario) => u.admin ? 'admin' : m.get(u.id) === 'pro' ? 'pro' : 'free'
  }, [subs])

  const usuarios = useMemo(() => {
    const lista = (dados?.usuarios ?? []).filter((u) =>
      u.email?.toLowerCase().includes(busca.toLowerCase()) && (filtroPlano === 'todos' || planoDe(u) === filtroPlano))
    return [...lista].sort((a, b) => ordem === 'pontos' ? b.pontos - a.pontos : String(b[ordem] ?? '').localeCompare(String(a[ordem] ?? '')))
  }, [dados, busca, ordem, filtroPlano, planoDe])

  const selecionaveis = usuarios.filter((u) => u.id !== session?.user.id)
  const atual = dados?.usuarios.find((u) => u.id === detalhe) ?? null
  const subAtual = subs.find((s) => s.user_id === detalhe)

  function abrirDetalhe(id: string) { setDetalhe(id); setSenha(''); setConfirmaExcluir(false); setAviso(''); setErro('') }
  function marcar(id: string) {
    setSel((x) => { const nx = new Set(x); if (nx.has(id)) nx.delete(id); else nx.add(id); return nx })
    setConfirmaLote(false)
  }
  function gerarSenha() {
    const c = 'abcdefghjkmnpqrstuvwxyz23456789'
    setSenha(Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => c[x % c.length]).join(''))
  }

  async function resetar(u: Usuario) {
    setAviso(''); setErro('')
    const { error } = await supabase.rpc('admin_reset_password', { p_user: u.id, p_password: senha })
    if (error) { setErro(error.message.includes('senha_curta') ? 'A senha precisa ter pelo menos 6 caracteres.' : 'Não foi possível trocar a senha.'); return }
    setAviso(`Senha de ${u.email} alterada para: ${senha}`); setSenha('')
  }
  async function alternarAdmin(u: Usuario) {
    setAviso(''); setErro('')
    const { error } = await supabase.rpc('admin_set_admin', { p_user: u.id, p_value: !u.admin })
    if (error) { setErro(error.message.includes('a_si') ? 'Você não pode remover o seu próprio acesso de admin.' : 'Não foi possível alterar.'); return }
    carregar()
  }
  async function excluir(ids: string[]) {
    setAviso(''); setErro(''); setExcluindo(true)
    let falhas = 0
    for (const id of ids.filter((x) => x !== session?.user.id)) {
      const { error } = await supabase.rpc('admin_delete_user', { p_user: id })
      if (error) falhas++
    }
    const ok = ids.length - falhas
    setExcluindo(false); setConfirmaLote(false); setConfirmaExcluir(false); setSel(new Set()); setDetalhe(null)
    if (falhas) setErro(`${falhas} ${falhas === 1 ? 'conta não pôde ser excluída' : 'contas não puderam ser excluídas'}.`)
    if (ok > 0) setAviso(`${ok} ${ok === 1 ? 'conta excluída' : 'contas excluídas'}.`)
    carregar()
  }

  if (isAdmin === null) return <div className="center muted">Carregando…</div>
  if (!isAdmin) return (
    <div className="center" style={{ flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 28 }}>Área restrita</h1>
      <Link to="/painel">Voltar ao painel</Link>
    </div>
  )

  const t = dados?.totais
  const dias = dados?.diario ?? []
  const ativas = subs.filter((s) => s.plano === 'pro')
  const canceladas30 = subs.filter((s) => s.status === 'canceled' && Date.now() - new Date(s.atualizado).getTime() < 30 * 864e5).length
  const titulo = MENU.find((m) => m.id === secao)?.label ?? 'Visão geral'

  return (
    <div className="adm">
      <aside className={`adm-side${menuAberto ? ' aberto' : ''}`}>
        <Link to="/" className="adm-logo"><img src="/logo-wordmark-light.png" alt="Quizuu" /></Link>
        <span className="adm-side__label">Administração</span>
        <nav aria-label="Seções do admin">
          {MENU.map((m) => (
            <NavLink key={m.id} to={`/admin/${m.id}`} className={({ isActive }) => `adm-nav${isActive || (m.id === 'visao-geral' && secao === 'visao-geral') ? ' on' : ''}`}>
              <Icon d={m.icon} /><span>{m.label}</span>
              {m.id === 'contas' && t && <em>{n(t.usuarios)}</em>}
              {m.id === 'assinaturas' && <em>{ativas.length}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="adm-side__foot">
          <span>{session?.user.email}</span>
          <Link to="/painel">← Voltar ao painel</Link>
        </div>
      </aside>
      {menuAberto && <button className="adm-veu" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />}

      <div className="adm-main">
        <header className="adm-top">
          <button className="adm-burger" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}><Icon d="M4 6h16M4 12h16M4 18h16" /></button>
          <h1>{titulo}</h1>
          <button className="qz-btn qz-btn--secondary adm-refresh" onClick={carregar}><Icon d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /><span>Atualizar</span></button>
        </header>

        <div className="adm-body">
          {erro && <p className="notice notice--err">{erro}</p>}
          {aviso && <p className="notice notice--ok" style={{ userSelect: 'all' }}>{aviso}</p>}
          {!t ? <p className="muted">Carregando…</p> : <>

            {secao === 'visao-geral' && <>
              <div className="kpis">
                <Kpi valor={n(t.usuarios)} rotulo="contas criadas" />
                <Kpi valor={n(t.usuarios_7d)} rotulo="novas nos últimos 7 dias" />
                <Kpi valor={n(ativas.length)} rotulo="assinantes Pro" destaque />
                <Kpi valor={(ativas.length * PRECO_PRO).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} rotulo="receita mensal recorrente" destaque />
              </div>
              <div className="kpis">
                <Kpi valor={n(t.ativos_7d)} rotulo="entraram nos últimos 7 dias" />
                <Kpi valor={n(dados!.usuarios.filter((u) => u.partidas + u.votacoes > 0).length)} rotulo="já usaram de verdade" />
                <Kpi valor={n(t.partidas)} rotulo="partidas abertas" />
                <Kpi valor={n(t.jogadores)} rotulo="jogadores no total" />
              </div>
              <div className="card adm-card">
                <div className="adm-card__head">
                  <h2>Últimos 30 dias</h2>
                  <div className="admin-chips" role="tablist">
                    {SERIES.map((s) => (
                      <button key={s.key} role="tab" aria-selected={serie === s.key} className={serie === s.key ? 'on' : ''} onClick={() => setSerie(s.key)}>
                        {s.label} · {n(dias.reduce((a, d) => a + d[s.key], 0))}
                      </button>
                    ))}
                  </div>
                </div>
                <Grafico dias={dias} serie={serie} />
              </div>
              <div className="adm-grid2">
                <div className="card adm-card">
                  <div className="adm-card__head"><h2>Contas mais recentes</h2><Link to="/admin/contas">Ver todas</Link></div>
                  <ul className="adm-lista">
                    {[...dados!.usuarios].sort((a, b) => b.criado.localeCompare(a.criado)).slice(0, 5).map((u) => (
                      <li key={u.id}><span>{u.email}</span><span className="muted">{dataCurta(u.criado)}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="card adm-card">
                  <div className="adm-card__head"><h2>Quem mais usa</h2><Link to="/admin/contas">Ver todas</Link></div>
                  <ul className="adm-lista">
                    {[...dados!.usuarios].sort((a, b) => b.pontos - a.pontos).slice(0, 5).map((u) => (
                      <li key={u.id}><span>{u.email}</span><span className="muted">{u.partidas} partidas · {u.votacoes} votações</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            </>}

            {secao === 'contas' && <>
              <div className="adm-toolbar">
                <label className="sr-only" htmlFor="busca">Buscar e-mail</label>
                <input id="busca" className="input" placeholder="Buscar por e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <div className="admin-chips">
                  {(['todos', 'pro', 'free', 'admin'] as const).map((f) => (
                    <button key={f} className={filtroPlano === f ? 'on' : ''} onClick={() => setFiltroPlano(f)}>
                      {{ todos: 'Todas', pro: 'Pro', free: 'Grátis', admin: 'Admins' }[f]}
                    </button>
                  ))}
                </div>
                <label className="sr-only" htmlFor="ordem">Ordenar</label>
                <select id="ordem" className="input" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
                  <option value="criado">Mais recentes</option>
                  <option value="ultimo_login">Último acesso</option>
                  <option value="pontos">Quem mais usa</option>
                </select>
              </div>
              {sel.size > 0 && (
                <div className="admin-lote" role="region" aria-label="Ações para as contas selecionadas">
                  <strong>{sel.size} {sel.size === 1 ? 'selecionada' : 'selecionadas'}</strong>
                  {confirmaLote ? <>
                    <span>Excluir e apagar tudo o que criaram? Não dá para desfazer.</span>
                    <button className="qz-btn qz-btn--secondary" onClick={() => setConfirmaLote(false)} disabled={excluindo}>Cancelar</button>
                    <button className="qz-btn qz-btn--danger" onClick={() => excluir([...sel])} disabled={excluindo}>{excluindo ? 'Excluindo…' : 'Confirmar exclusão'}</button>
                  </> : <>
                    <button className="qz-btn qz-btn--danger" onClick={() => setConfirmaLote(true)}>Excluir selecionadas</button>
                    <button className="qz-btn qz-btn--ghost" onClick={() => setSel(new Set())}>Limpar seleção</button>
                  </>}
                </div>
              )}
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="admin-tabela adm-tabela--click">
                  <thead><tr>
                    <th style={{ width: 40 }}><input type="checkbox" aria-label="Selecionar todas as contas listadas"
                      checked={selecionaveis.length > 0 && selecionaveis.every((u) => sel.has(u.id))}
                      onChange={(e) => { setConfirmaLote(false); setSel(e.target.checked ? new Set(selecionaveis.map((u) => u.id)) : new Set()) }} /></th>
                    <th>Conta</th><th>Plano</th><th>Criada</th><th>Último acesso</th><th>Quizzes</th><th>Partidas</th><th>Votações</th><th>IA</th>
                  </tr></thead>
                  <tbody>
                    {usuarios.length === 0 && <tr><td colSpan={9} className="muted">Nenhuma conta encontrada.</td></tr>}
                    {usuarios.map((u) => {
                      const p = planoDe(u)
                      return (
                        <tr key={u.id} className={detalhe === u.id ? 'on' : ''}>
                          <td>{u.id !== session?.user.id && <input type="checkbox" aria-label={`Selecionar ${u.email}`} checked={sel.has(u.id)} onChange={() => marcar(u.id)} />}</td>
                          <td><button className="adm-link" onClick={() => abrirDetalhe(u.id)}>{u.email}</button></td>
                          <td><span className={`adm-plano adm-plano--${p}`}>{{ admin: 'Admin', pro: 'Pro', free: 'Grátis' }[p]}</span></td>
                          <td>{dataCurta(u.criado)}</td><td>{dataHora(u.ultimo_login)}</td>
                          <td>{u.quizzes}</td><td>{u.partidas}</td><td>{u.votacoes}</td><td>{u.ia}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>{usuarios.length} de {dados!.usuarios.length} contas. Clique no e-mail para ver detalhes, trocar senha ou excluir.</p>
            </>}

            {secao === 'assinaturas' && <>
              <div className="kpis">
                <Kpi valor={n(ativas.length)} rotulo="assinaturas ativas" destaque />
                <Kpi valor={(ativas.length * PRECO_PRO).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} rotulo="receita mensal recorrente" destaque />
                <Kpi valor={n(subs.filter((s) => s.status === 'past_due').length)} rotulo="com pagamento pendente" />
                <Kpi valor={n(canceladas30)} rotulo="canceladas nos últimos 30 dias" />
              </div>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="admin-tabela">
                  <thead><tr><th>Conta</th><th>Situação</th><th>Renova / termina</th><th>Atualizado</th><th>Stripe</th></tr></thead>
                  <tbody>
                    {subs.filter((s) => s.status !== 'inactive').length === 0 && <tr><td colSpan={5} className="muted">Nenhuma assinatura ainda.</td></tr>}
                    {subs.filter((s) => s.status !== 'inactive').map((s) => (
                      <tr key={s.user_id}>
                        <td><strong>{s.email}</strong></td>
                        <td><span className={`adm-status adm-status--${s.status}`}>{STATUS[s.status] ?? s.status}</span>{s.cancela && s.status === 'active' && <span className="muted"> · cancela no fim</span>}</td>
                        <td>{dataCurta(s.fim)}</td>
                        <td>{dataHora(s.atualizado)}</td>
                        <td>{s.customer && <a href={`https://dashboard.stripe.com/customers/${s.customer}`} target="_blank" rel="noreferrer">Abrir cliente</a>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>Plano Pro a R$ 25/mês. Reembolsos e cancelamentos manuais são feitos no painel do Stripe.</p>
            </>}

            {secao === 'uso' && <>
              <div className="admin-uso">
                <div className="card admin-bloco">
                  <h3>Quiz ao vivo</h3>
                  <dl>
                    <div><dt>Quizzes criados</dt><dd>{n(t.quizzes)}</dd></div>
                    <div><dt>Perguntas</dt><dd>{n(t.perguntas)}</dd></div>
                    <div><dt>Partidas abertas</dt><dd>{n(t.partidas)}</dd></div>
                    <div><dt>Partidas até o pódio</dt><dd>{n(t.partidas_finalizadas)}</dd></div>
                    <div><dt>Jogadores</dt><dd>{n(t.jogadores)}</dd></div>
                    <div><dt>Respostas enviadas</dt><dd>{n(t.respostas)}</dd></div>
                  </dl>
                </div>
                <div className="card admin-bloco">
                  <h3>Votações</h3>
                  <dl>
                    <div><dt>Votações criadas</dt><dd>{n(t.votacoes)}</dd></div>
                    <div><dt>Votos recebidos</dt><dd>{n(t.votos)}</dd></div>
                  </dl>
                </div>
                <div className="card admin-bloco">
                  <h3>IA</h3>
                  <dl>
                    <div><dt>Gerações</dt><dd>{n(t.geracoes_ia)}</dd></div>
                    <div><dt>A partir de tema</dt><dd>{n(t.geracoes_ia_tema)}</dd></div>
                    <div><dt>A partir de material</dt><dd>{n(t.geracoes_ia_material)}</dd></div>
                    <div><dt>Perguntas geradas</dt><dd>{n(t.perguntas_ia)}</dd></div>
                  </dl>
                </div>
              </div>
              <div className="card adm-card">
                <div className="adm-card__head">
                  <h2>Uso por dia</h2>
                  <div className="admin-chips" role="tablist">
                    {SERIES.filter((s) => s.key !== 'cadastros').map((s) => (
                      <button key={s.key} role="tab" aria-selected={serie === s.key} className={serie === s.key ? 'on' : ''} onClick={() => setSerie(s.key)}>{s.label}</button>
                    ))}
                  </div>
                </div>
                <Grafico dias={dias} serie={serie === 'cadastros' ? 'partidas' : serie} />
              </div>
            </>}

            {secao === 'ia' && <AdminIA />}
          </>}
        </div>
      </div>

      {atual && (
        <>
          <button className="adm-veu adm-veu--drawer" aria-label="Fechar detalhes" onClick={() => setDetalhe(null)} />
          <aside className="adm-drawer" aria-label={`Detalhes de ${atual.email}`}>
            <div className="adm-drawer__head">
              <div>
                <span className={`adm-plano adm-plano--${planoDe(atual)}`}>{{ admin: 'Admin', pro: 'Pro', free: 'Grátis' }[planoDe(atual)]}</span>
                <h2>{atual.email}</h2>
                <span className="muted">Criada em {dataHora(atual.criado)} · último acesso {dataHora(atual.ultimo_login)}</span>
              </div>
              <button className="qz-btn qz-btn--ghost icon-btn" aria-label="Fechar" onClick={() => setDetalhe(null)}><Icon d="M6 6l12 12M18 6L6 18" /></button>
            </div>
            {erro && <p className="notice notice--err">{erro}</p>}
            {aviso && <p className="notice notice--ok" style={{ userSelect: 'all' }}>{aviso}</p>}
            <div className="adm-mini">
              <div><strong>{atual.quizzes}</strong><span>quizzes</span></div>
              <div><strong>{atual.partidas}</strong><span>partidas</span></div>
              <div><strong>{atual.jogadores}</strong><span>jogadores</span></div>
              <div><strong>{atual.votacoes}</strong><span>votações</span></div>
              <div><strong>{atual.votos}</strong><span>votos</span></div>
              <div><strong>{atual.ia}</strong><span>gerações IA</span></div>
            </div>
            {subAtual && subAtual.status !== 'inactive' && (
              <section className="adm-drawer__sec">
                <h3>Assinatura</h3>
                <p style={{ margin: 0 }}>{STATUS[subAtual.status] ?? subAtual.status} · {subAtual.cancela ? 'termina' : 'renova'} em {dataCurta(subAtual.fim)}</p>
                {subAtual.customer && <a href={`https://dashboard.stripe.com/customers/${subAtual.customer}`} target="_blank" rel="noreferrer">Abrir no Stripe</a>}
              </section>
            )}
            <section className="adm-drawer__sec">
              <h3>Trocar senha</h3>
              <label className="sr-only" htmlFor="nova-senha">Nova senha</label>
              <div className="btn-row">
                <input id="nova-senha" className="input" style={{ flex: 1, minWidth: 160 }} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" />
                <button className="qz-btn qz-btn--secondary" onClick={gerarSenha}>Gerar</button>
              </div>
              <button className="qz-btn qz-btn--primary" disabled={senha.length < 6} onClick={() => resetar(atual)}>Salvar nova senha</button>
            </section>
            <section className="adm-drawer__sec">
              <h3>Permissões</h3>
              <button className="qz-btn qz-btn--secondary" onClick={() => alternarAdmin(atual)}>{atual.admin ? 'Remover acesso de admin' : 'Tornar admin'}</button>
            </section>
            {atual.id !== session?.user.id && (
              <section className="adm-drawer__sec adm-drawer__perigo">
                <h3>Excluir conta</h3>
                <p className="muted" style={{ margin: 0 }}>Apaga a conta e tudo o que ela criou. Se tiver assinatura, cancele antes no Stripe.</p>
                {confirmaExcluir
                  ? <div className="btn-row"><button className="qz-btn qz-btn--secondary" onClick={() => setConfirmaExcluir(false)}>Cancelar</button><button className="qz-btn qz-btn--danger" disabled={excluindo} onClick={() => excluir([atual.id])}>{excluindo ? 'Excluindo…' : 'Confirmar exclusão'}</button></div>
                  : <button className="qz-btn qz-btn--danger" onClick={() => setConfirmaExcluir(true)}>Excluir conta</button>}
              </section>
            )}
          </aside>
        </>
      )}
    </div>
  )
}
