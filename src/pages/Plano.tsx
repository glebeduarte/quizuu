import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PRECO, usePlano } from '../lib/plan'

function Barra({ usado, total, rotulo }: { usado: number; total: number; rotulo: string }) {
  const pct = total ? Math.min(100, (usado / total) * 100) : 0
  return (
    <div className="plano-uso">
      <div className="plano-uso__top"><span>{rotulo}</span><strong>{usado} de {total}</strong></div>
      <div className="ia-barra"><div style={{ width: `${pct}%`, background: pct >= 100 ? '#e2332b' : '#e8620c' }} /></div>
    </div>
  )
}

const RECURSOS: [string, string, string][] = [
  ['Quizzes', 'até 15', 'até 50'],
  ['Votações ao vivo', 'até 15', 'até 50'],
  ['Partidas e jogadores', 'sem limite', 'sem limite'],
  ['Relatórios e CSV', 'sim', 'sim'],
  ['Gerar quiz com IA (tema ou material)', '3 para experimentar', '25 por mês'],
]

export default function Plano() {
  const { plano, recarregar } = usePlano()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState('')
  const [erro, setErro] = useState('')
  const voltou = params.get('ok') === '1'

  // Depois do pagamento, o Stripe avisa o servidor em alguns segundos
  useEffect(() => {
    if (!voltou || plano?.plan === 'pro') return
    const t = setInterval(recarregar, 2500)
    return () => clearInterval(t)
  }, [voltou, plano?.plan])

  async function abrir(action: 'checkout' | 'portal') {
    setErro(''); setBusy(action)
    const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { action, origin: window.location.origin } })
    if (error || !data?.url) { setErro('Não foi possível abrir o pagamento agora. Tente de novo em instantes.'); setBusy(''); return }
    window.location.href = data.url
  }

  const pro = plano?.plan === 'pro'
  const fim = plano?.assinatura?.fim ? new Date(plano.assinatura.fim).toLocaleDateString('pt-BR') : null

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/painel" className="qz-btn qz-btn--ghost" style={{ paddingLeft: 0 }}>← Meus quizzes</Link>
      </header>
      <main className="content" style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start', maxWidth: 880 }}>
        <div>
          <span className="eyebrow">Meu plano</span>
          <h1 style={{ fontSize: 36, margin: '4px 0 0' }}>{!plano ? 'Carregando…' : plano.plan === 'admin' ? 'Administrador' : pro ? 'Você está no Pro' : 'Você está no plano Grátis'}</h1>
        </div>
        {voltou && !pro && plano && <p className="notice notice--ok">Pagamento recebido. Estamos ativando o seu plano, leva só alguns segundos…</p>}
        {voltou && pro && <p className="notice notice--ok">Tudo certo. O Pro já está ativo na sua conta.</p>}
        {erro && <p className="notice notice--err">{erro}</p>}

        {plano && plano.plan !== 'admin' && (
          <div className="card" style={{ display: 'grid', gap: 16 }}>
            <Barra rotulo="Quizzes" usado={plano.quizzes} total={plano.limits.quizzes} />
            <Barra rotulo="Votações" usado={plano.votacoes} total={plano.limits.votacoes} />
            {plano.ia.enabled && <Barra rotulo="Gerações com IA neste mês" usado={plano.ia.used} total={plano.ia.limit} />}
            {pro && fim && <p className="muted" style={{ margin: 0, fontSize: 14 }}>{plano.assinatura?.cancela ? `Assinatura cancelada. O Pro fica ativo até ${fim}.` : `Próxima cobrança em ${fim}.`}</p>}
          </div>
        )}

        <div className="planos">
          <div className={`card plano-card${!pro ? ' atual' : ''}`}>
            <h2>Grátis</h2>
            <p className="plano-preco">R$ 0</p>
            <ul>{RECURSOS.map(([r, g]) => <li key={r} className={g === 'não' ? 'off' : ''}><span>{r}</span><strong>{g}</strong></li>)}</ul>
            {!pro && plano?.plan !== 'admin' && <span className="plano-tag">Seu plano</span>}
          </div>
          <div className={`card plano-card plano-card--pro${pro ? ' atual' : ''}`}>
            <h2>Pro</h2>
            <p className="plano-preco">{PRECO}<span>/mês</span></p>
            <ul>{RECURSOS.map(([r, , p]) => <li key={r}><span>{r}</span><strong>{p}</strong></li>)}</ul>
            {plano?.plan === 'admin' ? null : pro
              ? <button className="qz-btn qz-btn--secondary" onClick={() => abrir('portal')} disabled={!!busy}>{busy ? 'Abrindo…' : 'Gerenciar assinatura'}</button>
              : <button className="qz-btn qz-btn--primary qz-btn--lg" onClick={() => abrir('checkout')} disabled={!!busy || !plano}>{busy ? 'Abrindo pagamento…' : `Assinar por ${PRECO}/mês`}</button>}
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Pagamento seguro pelo Stripe. Cancele quando quiser, sem multa.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
