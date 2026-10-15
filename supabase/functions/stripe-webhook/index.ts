// Quizuu · recebe os avisos do Stripe e atualiza o plano da conta
// Publicar com "Verify JWT" DESLIGADO. Segredos: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const enc = new TextEncoder()

async function assinaturaValida(payload: string, header: string, secret: string) {
  const partes = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
  const t = partes['t']
  const assinaturas = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3))
  if (!t || !assinaturas.length) return false
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`))
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('')
  return assinaturas.includes(hex)
}

async function buscarAssinatura(id: string) {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${id}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` },
  })
  return res.ok ? await res.json() : null
}

Deno.serve(async (req) => {
  const payload = await req.text()
  const ok = await assinaturaValida(payload, req.headers.get('stripe-signature') ?? '', Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '')
  if (!ok) return new Response('assinatura inválida', { status: 400 })

  const evento = JSON.parse(payload)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const obj = evento.data?.object ?? {}

  let sub: Record<string, any> | null = null
  if (evento.type === 'checkout.session.completed' && obj.subscription) sub = await buscarAssinatura(obj.subscription)
  else if (evento.type?.startsWith('customer.subscription.')) sub = obj
  else if (evento.type?.startsWith('invoice.') && obj.subscription) sub = await buscarAssinatura(obj.subscription)
  if (!sub) return new Response('ignorado', { status: 200 })

  let userId: string | undefined = sub.metadata?.user_id ?? obj.client_reference_id
  if (!userId) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle()
    userId = data?.user_id
  }
  if (!userId) return new Response('sem usuário', { status: 200 })

  const fim = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
  const { error } = await admin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    status: evento.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
    current_period_end: fim ? new Date(fim * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  })
  if (error) { console.error(error.message); return new Response('erro', { status: 500 }) }
  return new Response('ok', { status: 200 })
})
