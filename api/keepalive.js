// Quizuu · mantém o projeto do Supabase ativo (o plano gratuito pausa após 7 dias sem uso).
// Chamado todo dia pelo agendador da Vercel (vercel.json → crons) e, como reserva, pelo GitHub Actions.
const URL_ = process.env.VITE_SUPABASE_URL || 'https://ekdffjubkhsrmoprsylw.supabase.co'
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_G9IOb70jywn8RlNjh3kIoA_Pata2ONt'

export default async function handler(req, res) {
  const t = Date.now()
  try {
    // consulta real ao banco (função leve e pública)
    const r = await fetch(`${URL_}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    const ok = r.ok
    res.setHeader('Cache-Control', 'no-store')
    res.status(ok ? 200 : 502).json({ ok, status: r.status, ms: Date.now() - t, at: new Date().toISOString() })
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e), at: new Date().toISOString() })
  }
}
