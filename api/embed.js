// Quizuu · página de incorporação para Canva, Notion e outros que usam oEmbed/Iframely.
// /embed/CODIGO?k=CHAVE&p=N  → HTML com metadados de player apontando para a tela do resultado.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export default function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const origin = `https://${host}`
  const code = String(req.query.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  if (!code) { res.status(404).send('Votação não encontrada'); return }
  const k = String(req.query.k || '').replace(/[^a-f0-9-]/gi, '').slice(0, 64)
  const p = String(req.query.p || '').replace(/\D/g, '').slice(0, 3)
  const qs = new URLSearchParams({ ...(k && { k }), ...(p && { p }) }).toString()
  const screen = `${origin}/v/${code}/tela${qs ? `?${qs}` : ''}`
  const self = `${origin}/embed/${code}${qs ? `?${qs}` : ''}`
  const oembed = `${origin}/api/oembed?url=${encodeURIComponent(self)}`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Votação ao vivo ${esc(code)} · Quizuu</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="alternate" type="application/json+oembed" href="${esc(oembed)}" title="Quizuu">
<meta property="og:type" content="video.other">
<meta property="og:title" content="Votação ao vivo · Quizuu">
<meta property="og:description" content="Resultado ao vivo da votação ${esc(code)}">
<meta property="og:image" content="${origin}/og-image.png">
<meta property="og:url" content="${esc(self)}">
<meta property="og:video:url" content="${esc(screen)}">
<meta property="og:video:secure_url" content="${esc(screen)}">
<meta property="og:video:type" content="text/html">
<meta property="og:video:width" content="1280">
<meta property="og:video:height" content="720">
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="Votação ao vivo · Quizuu">
<meta name="twitter:image" content="${origin}/og-image.png">
<meta name="twitter:player" content="${esc(screen)}">
<meta name="twitter:player:width" content="1280">
<meta name="twitter:player:height" content="720">
<style>html,body{margin:0;height:100%;background:#3d1278}iframe{border:0;width:100%;height:100%;display:block}</style>
</head><body><iframe src="${esc(screen)}" title="Resultado ao vivo" allow="fullscreen"></iframe></body></html>`)
}
