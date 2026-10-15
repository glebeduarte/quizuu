// Quizuu · abre o checkout de assinatura ou o portal do cliente no Stripe
// Segredos: STRIPE_SECRET_KEY, STRIPE_PRICE_ID
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const ORIGENS = ['https://quizuubr.vercel.app', 'https://quizuu-beryl.vercel.app', 'http://localhost:5173']

async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message ?? 'stripe')
  return json
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!Deno.env.get('STRIPE_SECRET_KEY') || !Deno.env.get('STRIPE_PRICE_ID')) return reply(503, { erro: 'stripe_nao_configurado' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return reply(401, { erro: 'nao_autenticado' })

  const body = await req.json().catch(() => ({}))
  const origin = ORIGENS.includes(body.origin) ? body.origin : ORIGENS[0]

  try {
    const { data: sub } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle()
    let customer = sub?.stripe_customer_id as string | undefined
    if (!customer) {
      const c = await stripe('customers', { email: user.email ?? '', 'metadata[user_id]': user.id })
      customer = c.id as string
      await admin.from('subscriptions').upsert({ user_id: user.id, stripe_customer_id: customer, updated_at: new Date().toISOString() })
    }

    if (body.action === 'portal') {
      const p = await stripe('billing_portal/sessions', { customer, return_url: `${origin}/plano` })
      return reply(200, { url: p.url })
    }

    const s = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      'line_items[0][price]': Deno.env.get('STRIPE_PRICE_ID')!,
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][user_id]': user.id,
      allow_promotion_codes: 'true',
      locale: 'pt-BR',
      success_url: `${origin}/plano?ok=1`,
      cancel_url: `${origin}/plano`,
    })
    return reply(200, { url: s.url })
  } catch (e) {
    console.error('stripe', (e as Error).message)
    return reply(502, { erro: 'falha_stripe' })
  }
})
