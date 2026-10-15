// Quizuu · endpoint oEmbed (rich) para a página /embed/CODIGO
export default function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const origin = `https://${host}`
  let u
  try { u = new URL(String(req.query.url || '')) } catch { res.status(400).json({ error: 'url inválida' }); return }
  const m = u.pathname.match(/^\/(?:embed|v)\/([A-Za-z0-9]{4,8})(?:\/tela)?\/?$/)
  if (!m || u.host !== host) { res.status(404).json({ error: 'não encontrado' }); return }
  const code = m[1].toUpperCase()
  const k = (u.searchParams.get('k') || '').replace(/[^a-f0-9-]/gi, '')
  const p = (u.searchParams.get('p') || '').replace(/\D/g, '')
  const qs = new URLSearchParams({ ...(k && { k }), ...(p && { p }) }).toString()
  const screen = `${origin}/v/${code}/tela${qs ? `?${qs}` : ''}`
  const w = Math.min(Number(req.query.maxwidth) || 1280, 1920), h = Math.round(w * 9 / 16)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json({
    version: '1.0', type: 'rich', provider_name: 'Quizuu', provider_url: origin,
    title: `Votação ao vivo ${code}`, width: w, height: h,
    thumbnail_url: `${origin}/og-image.png`, thumbnail_width: 1200, thumbnail_height: 630,
    html: `<iframe src="${screen}" width="${w}" height="${h}" style="border:0" allow="fullscreen" title="Resultado ao vivo Quizuu"></iframe>`,
  })
}
