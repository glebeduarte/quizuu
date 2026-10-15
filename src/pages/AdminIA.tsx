import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Config = { price_in: number; price_out: number; budget: number; default_limit: number }
type Conta = { id: string; email: string; admin: boolean; enabled: boolean; liberado_manual: boolean; limit: number; usadas_mes: number; tokens_mes: number; custo_mes: number }
type Origem = { origem: string; geracoes: number; media_in: number; media_out: number; custo_medio: number }
type Dados = {
  config: Config
  mes: { geracoes: number; tokens_in: number; tokens_out: number; custo: number }
  por_origem: Origem[]
  diario: { dia: string; tokens: number; geracoes: number }[]
  contas: Conta[]
}

const n = (v: number) => Math.round(v).toLocaleString('pt-BR')
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })

export default function AdminIA() {
  const [d, setD] = useState<Dados | null>(null)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [filtro, setFiltro] = useState<'liberadas' | 'todas'>('liberadas')
  const [limites, setLimites] = useState<Record<string, string>>({})

  async function carregar() {
    const { data, error } = await supabase.rpc('admin_ai')
    if (error) { setErro('Não foi possível carregar o consumo de IA.'); return }
    setD(data as Dados); setCfg((data as Dados).config)
  }
  useEffect(() => { carregar() }, [])

  async function salvarConfig() {
    if (!cfg) return
    setErro(''); setOk('')
    const { error } = await supabase.rpc('admin_set_ai_settings', { p_in: cfg.price_in, p_out: cfg.price_out, p_budget: cfg.budget, p_default: cfg.default_limit })
    if (error) { setErro('Não foi possível salvar a configuração.'); return }
    setOk('Configuração salva.'); carregar()
  }

  async function salvarConta(c: Conta, enabled: boolean) {
    setErro(''); setOk('')
    const limite = Number(limites[c.id] ?? c.limit)
    const { error } = await supabase.rpc('admin_set_ai_access', { p_user: c.id, p_enabled: enabled, p_limit: limite })
    if (error) { setErro('Não foi possível alterar o acesso.'); return }
    setLimites((l) => { const x = { ...l }; delete x[c.id]; return x })
    carregar()
  }

  const custoMedio = useMemo(() => {
    const o = d?.por_origem ?? []
    const total = o.reduce((a, x) => a + x.geracoes, 0)
    return total ? o.reduce((a, x) => a + x.custo_medio * x.geracoes, 0) / total : 0
  }, [d])

  if (!d || !cfg) return <section className="admin-sec"><h2>IA (Gemini)</h2>{erro ? <p className="notice notice--err">{erro}</p> : <p className="muted">Carregando…</p>}</section>

  const semPreco = !d.config.price_in && !d.config.price_out
  const pct = d.config.budget ? Math.min(100, (d.mes.custo / d.config.budget) * 100) : 0
  const cabem = d.config.budget && custoMedio ? Math.max(0, Math.floor((d.config.budget - d.mes.custo) / custoMedio)) : null
  const liberadas = d.contas.filter((c) => c.enabled)
  const reservadas = liberadas.reduce((a, c) => a + Math.max(0, c.limit - c.usadas_mes), 0)
  const contas = (filtro === 'liberadas' ? liberadas : d.contas).slice().sort((a, b) => b.tokens_mes - a.tokens_mes || a.email.localeCompare(b.email))
  const maxTok = Math.max(1, ...d.diario.map((x) => x.tokens))

  return (
    <section className="admin-sec">
      <h2>IA (Gemini)</h2>
      {erro && <p className="notice notice--err">{erro}</p>}
      {ok && <p className="notice notice--ok">{ok}</p>}

      <div className="kpis">
        <div className="kpi"><strong>{n(d.mes.geracoes)}</strong><span>gerações neste mês</span></div>
        <div className="kpi"><strong>{n(d.mes.tokens_in + d.mes.tokens_out)}</strong><span>tokens no mês ({n(d.mes.tokens_in)} entrada, {n(d.mes.tokens_out)} saída)</span></div>
        <div className="kpi"><strong>{semPreco ? '—' : brl(d.mes.custo)}</strong><span>{semPreco ? 'informe o preço abaixo para ver o custo' : d.config.budget ? `${pct.toFixed(0)}% do orçamento de ${brl(d.config.budget)}` : 'custo estimado no mês'}</span></div>
        <div className="kpi"><strong>{cabem === null ? '—' : n(cabem)}</strong><span>{cabem === null ? 'defina orçamento e preço para calcular' : 'gerações ainda cabem no orçamento'}</span></div>
      </div>
      {d.config.budget > 0 && <div className="ia-barra" aria-label={`${pct.toFixed(0)}% do orçamento usado`}><div style={{ width: `${pct}%`, background: pct > 85 ? '#e2332b' : '#e8620c' }} /></div>}
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {liberadas.length} {liberadas.length === 1 ? 'conta liberada' : 'contas liberadas'}, com {n(reservadas)} gerações ainda disponíveis nos limites deste mês
        {cabem !== null && (reservadas > cabem ? `. Atenção: os limites somados passam do que o orçamento comporta (${n(cabem)}).` : '. Os limites cabem no orçamento.')}
      </p>

      <div className="admin-uso">
        <div className="card admin-bloco">
          <h3>Custo médio por geração</h3>
          {d.por_origem.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aparece depois das primeiras gerações com a medição ativa.</p> : (
            <dl>
              {d.por_origem.map((o) => (
                <div key={o.origem}><dt>{o.origem === 'tema' ? 'Por tema' : 'Por material'} · {n(o.media_in + o.media_out)} tokens</dt><dd>{semPreco ? '—' : brl(o.custo_medio)}</dd></div>
              ))}
            </dl>
          )}
        </div>
        <div className="card admin-bloco">
          <h3>Tokens por dia (30 dias)</h3>
          <div className="admin-chart" style={{ height: 120 }}>
            {d.diario.map((x) => (
              <div key={x.dia} className="admin-col" title={`${new Date(x.dia + 'T12:00').toLocaleDateString('pt-BR')}: ${n(x.tokens)} tokens, ${x.geracoes} gerações`}>
                <div style={{ height: `${(x.tokens / maxTok) * 100}%`, background: '#7a2fe0' }} />
              </div>
            ))}
          </div>
        </div>
        <div className="card admin-bloco">
          <h3>Preço e orçamento</h3>
          <div className="ia-form">
            <label>R$ por 1 milhão de tokens de entrada<input className="input" type="number" min="0" step="0.01" value={cfg.price_in} onChange={(e) => setCfg({ ...cfg, price_in: Number(e.target.value) })} /></label>
            <label>R$ por 1 milhão de tokens de saída<input className="input" type="number" min="0" step="0.01" value={cfg.price_out} onChange={(e) => setCfg({ ...cfg, price_out: Number(e.target.value) })} /></label>
            <label>Orçamento mensal (R$)<input className="input" type="number" min="0" step="1" value={cfg.budget} onChange={(e) => setCfg({ ...cfg, budget: Number(e.target.value) })} /></label>
            <label>Limite padrão ao liberar (gerações/mês)<input className="input" type="number" min="0" step="1" value={cfg.default_limit} onChange={(e) => setCfg({ ...cfg, default_limit: Number(e.target.value) })} /></label>
            <button className="qz-btn qz-btn--primary" onClick={salvarConfig}>Salvar</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Quem pode usar a IA</h3>
        <div className="admin-chips">
          <button className={filtro === 'liberadas' ? 'on' : ''} onClick={() => setFiltro('liberadas')}>Liberadas · {liberadas.length}</button>
          <button className={filtro === 'todas' ? 'on' : ''} onClick={() => setFiltro('todas')}>Todas as contas · {d.contas.length}</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-tabela">
          <thead><tr><th>E-mail</th><th>Acesso</th><th>Limite/mês</th><th>Usadas</th><th>Tokens no mês</th><th>Custo no mês</th><th></th></tr></thead>
          <tbody>
            {contas.length === 0 && <tr><td colSpan={7} className="muted">Nenhuma conta liberada ainda. Veja "Todas as contas" para liberar.</td></tr>}
            {contas.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.email}</strong>{c.admin && <span className="admin-tag">admin</span>}</td>
                <td>{c.enabled ? <span className="ia-on">Liberada</span> : <span className="muted">Bloqueada</span>}</td>
                <td>
                  <label className="sr-only" htmlFor={'lim' + c.id}>Limite mensal de {c.email}</label>
                  <input id={'lim' + c.id} className="input ia-lim" type="number" min="0" value={limites[c.id] ?? String(c.limit)} onChange={(e) => setLimites({ ...limites, [c.id]: e.target.value })} />
                </td>
                <td>{c.usadas_mes} de {c.limit}</td>
                <td>{n(c.tokens_mes)}</td>
                <td>{semPreco ? '—' : brl(c.custo_mes)}</td>
                <td className="btn-row" style={{ flexWrap: 'nowrap' }}>
                  {limites[c.id] !== undefined && c.liberado_manual && <button className="qz-btn qz-btn--secondary" onClick={() => salvarConta(c, true)}>Salvar limite</button>}
                  {c.admin && !c.liberado_manual
                    ? <span className="muted" style={{ fontSize: 13 }}>admin sempre tem acesso</span>
                    : c.liberado_manual
                      ? <button className="qz-btn qz-btn--ghost" onClick={() => salvarConta(c, false)}>Bloquear</button>
                      : <button className="qz-btn qz-btn--primary" onClick={() => salvarConta(c, true)}>Liberar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>O custo é uma estimativa: tokens medidos em cada geração vezes o preço que você informar. Confira os preços do modelo na página de preços da API do Gemini. Gerações feitas antes desta atualização não têm tokens registrados.</p>
    </section>
  )
}
