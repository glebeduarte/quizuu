import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Totais = Record<string, number>
type Dia = { dia: string; cadastros: number; partidas: number; jogadores: number; votos: number; ia: number }
type Usuario = {
  id: string; email: string; criado: string; ultimo_login: string | null; admin: boolean
  quizzes: number; partidas: number; jogadores: number; votacoes: number; votos: number; ia: number; pontos: number
}
type Dados = { totais: Totais; diario: Dia[]; usuarios: Usuario[] }

const n = (v: number) => v.toLocaleString('pt-BR')
const data = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca'

const SERIES: { key: keyof Omit<Dia, 'dia'>; label: string; cor: string }[] = [
  { key: 'cadastros', label: 'Cadastros', cor: '#7a2fe0' },
  { key: 'partidas', label: 'Partidas', cor: '#e8620c' },
  { key: 'jogadores', label: 'Jogadores', cor: '#e2332b' },
  { key: 'votos', label: 'Votos', cor: '#c48a00' },
  { key: 'ia', label: 'Gerações IA', cor: '#3d1278' },
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

export default function Admin() {
  const { session } = useAuth()
  const isAdmin = useIsAdmin()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'pontos' | 'criado' | 'ultimo_login'>('pontos')
  const [serie, setSerie] = useState<keyof Omit<Dia, 'dia'>>('partidas')
  const [aberto, setAberto] = useState<string | null>(null)
  const [senha, setSenha] = useState('')
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null)

  async function carregar() {
    const { data, error } = await supabase.rpc('admin_overview')
    if (error) { setErro('Não foi possível carregar os dados.'); return }
    setDados(data as Dados)
  }
  useEffect(() => { if (isAdmin) carregar() }, [isAdmin])

  const usuarios = useMemo(() => {
    const lista = (dados?.usuarios ?? []).filter((u) => u.email?.toLowerCase().includes(busca.toLowerCase()))
    return [...lista].sort((a, b) => {
      if (ordem === 'pontos') return b.pontos - a.pontos
      return String(b[ordem] ?? '').localeCompare(String(a[ordem] ?? ''))
    })
  }, [dados, busca, ordem])

  function gerarSenha() {
    const c = 'abcdefghjkmnpqrstuvwxyz23456789'
    setSenha(Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => c[x % c.length]).join(''))
  }

  async function resetar(u: Usuario) {
    setAviso(''); setErro('')
    const { error } = await supabase.rpc('admin_reset_password', { p_user: u.id, p_password: senha })
    if (error) { setErro(error.message.includes('senha_curta') ? 'A senha precisa ter pelo menos 6 caracteres.' : 'Não foi possível trocar a senha.'); return }
    setAviso(`Senha de ${u.email} alterada para: ${senha}`)
    setSenha(''); setAberto(null)
  }

  async function alternarAdmin(u: Usuario) {
    setAviso(''); setErro('')
    const { error } = await supabase.rpc('admin_set_admin', { p_user: u.id, p_value: !u.admin })
    if (error) { setErro(error.message.includes('a_si') ? 'Você não pode remover o seu próprio acesso de admin.' : 'Não foi possível alterar.'); return }
    carregar()
  }

  async function excluir(u: Usuario) {
    setAviso(''); setErro('')
    const { error } = await supabase.rpc('admin_delete_user', { p_user: u.id })
    setConfirmaExcluir(null)
    if (error) { setErro('Não foi possível excluir o usuário.'); return }
    setAviso(`Conta ${u.email} excluída.`)
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
  const max = Math.max(1, ...dias.map((d) => d[serie]))
  const corSerie = SERIES.find((s) => s.key === serie)!.cor

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="wordmark"><picture><source srcSet="/logo-wordmark-light.png" media="(prefers-color-scheme: dark)" /><img src="/logo-wordmark.png" alt="Quizuu" /></picture></Link>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 14 }}>{session?.user.email}</span>
          <Link to="/painel" className="qz-btn qz-btn--ghost" style={{ textDecoration: 'none' }}>Painel</Link>
        </div>
      </header>
      <main className="content admin" style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 32 }}>Administração</h1>
          <button className="qz-btn qz-btn--secondary" onClick={carregar}>Atualizar</button>
        </div>
        {erro && <p className="notice notice--err">{erro}</p>}
        {aviso && <p className="notice notice--ok" style={{ userSelect: 'all' }}>{aviso}</p>}
        {!t ? <p className="muted">Carregando…</p> : <>
          <section className="admin-sec">
            <h2>Usuários</h2>
            <div className="kpis">
              <div className="kpi"><strong>{n(t.usuarios)}</strong><span>contas criadas</span></div>
              <div className="kpi"><strong>{n(t.usuarios_7d)}</strong><span>novas nos últimos 7 dias</span></div>
              <div className="kpi"><strong>{n(t.ativos_7d)}</strong><span>entraram nos últimos 7 dias</span></div>
              <div className="kpi"><strong>{n(dados!.usuarios.filter((u) => u.partidas + u.votacoes > 0).length)}</strong><span>já usaram de verdade</span></div>
            </div>
          </section>
          <section className="admin-sec">
            <h2>Uso por recurso</h2>
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
                <h3>IA (Gemini)</h3>
                <dl>
                  <div><dt>Gerações</dt><dd>{n(t.geracoes_ia)}</dd></div>
                  <div><dt>A partir de tema</dt><dd>{n(t.geracoes_ia_tema)}</dd></div>
                  <div><dt>A partir de material</dt><dd>{n(t.geracoes_ia_material)}</dd></div>
                  <div><dt>Perguntas geradas</dt><dd>{n(t.perguntas_ia)}</dd></div>
                </dl>
              </div>
            </div>
          </section>
          <section className="admin-sec">
            <h2>Últimos 30 dias</h2>
            <div className="card" style={{ display: 'grid', gap: 16 }}>
              <div className="admin-chips" role="tablist">
                {SERIES.map((s) => (
                  <button key={s.key} role="tab" aria-selected={serie === s.key} className={serie === s.key ? 'on' : ''} onClick={() => setSerie(s.key)}>
                    {s.label} · {n(dias.reduce((a, d) => a + d[s.key], 0))}
                  </button>
                ))}
              </div>
              <div className="admin-chart">
                {dias.map((d) => (
                  <div key={d.dia} className="admin-col" title={`${new Date(d.dia + 'T12:00').toLocaleDateString('pt-BR')}: ${d[serie]}`}>
                    <div style={{ height: `${(d[serie] / max) * 100}%`, background: corSerie }} />
                  </div>
                ))}
              </div>
              <div className="admin-eixo muted"><span>{dias[0] && new Date(dias[0].dia + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span><span>hoje</span></div>
            </div>
          </section>
          <section className="admin-sec">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
              <h2>Contas</h2>
              <div className="btn-row">
                <label className="sr-only" htmlFor="busca">Buscar e-mail</label>
                <input id="busca" className="input" placeholder="Buscar e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <label className="sr-only" htmlFor="ordem">Ordenar</label>
                <select id="ordem" className="input" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
                  <option value="pontos">Quem mais usa</option>
                  <option value="criado">Mais recentes</option>
                  <option value="ultimo_login">Último acesso</option>
                </select>
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="admin-tabela">
                <thead><tr>
                  <th>E-mail</th><th>Criada</th><th>Último acesso</th><th>Quizzes</th><th>Partidas</th><th>Jogadores</th><th>Votações</th><th>Votos</th><th>IA</th><th></th>
                </tr></thead>
                <tbody>
                  {usuarios.map((u) => (<Fragment key={u.id}>
                    <tr key={u.id}>
                      <td><strong>{u.email}</strong>{u.admin && <span className="admin-tag">admin</span>}</td>
                      <td>{data(u.criado)}</td><td>{data(u.ultimo_login)}</td>
                      <td>{u.quizzes}</td><td>{u.partidas}</td><td>{u.jogadores}</td><td>{u.votacoes}</td><td>{u.votos}</td><td>{u.ia}</td>
                      <td><button className="qz-btn qz-btn--ghost" onClick={() => { setAberto(aberto === u.id ? null : u.id); setSenha(''); setConfirmaExcluir(null) }}>{aberto === u.id ? 'Fechar' : 'Gerenciar'}</button></td>
                    </tr>
                    {aberto === u.id && (
                      <tr key={u.id + '-a'} className="admin-acoes"><td colSpan={10}>
                        <div className="admin-acoes__in">
                          <div className="btn-row" style={{ alignItems: 'center' }}>
                            <label htmlFor={'s' + u.id}>Nova senha</label>
                            <input id={'s' + u.id} className="input" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" />
                            <button className="qz-btn qz-btn--secondary" onClick={gerarSenha}>Gerar</button>
                            <button className="qz-btn qz-btn--primary" disabled={senha.length < 6} onClick={() => resetar(u)}>Trocar senha</button>
                          </div>
                          <div className="btn-row">
                            <button className="qz-btn qz-btn--secondary" onClick={() => alternarAdmin(u)}>{u.admin ? 'Remover admin' : 'Tornar admin'}</button>
                            {confirmaExcluir === u.id
                              ? <><span>Excluir a conta e tudo o que ela criou?</span><button className="qz-btn qz-btn--secondary" onClick={() => setConfirmaExcluir(null)}>Cancelar</button><button className="qz-btn qz-btn--danger" onClick={() => excluir(u)}>Excluir conta</button></>
                              : u.id !== session?.user.id && <button className="qz-btn qz-btn--ghost" onClick={() => setConfirmaExcluir(u.id)}>Excluir conta</button>}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>"Quem mais usa" pesa partidas e votações (10 pontos cada), gerações de IA (5), jogadores e votos recebidos (1 cada).</p>
          </section>
        </>}
      </main>
    </div>
  )
}
