// Quizuu · sons do jogo: músicas em arquivo (lobby, pergunta, pódio) e efeitos sintetizados (Web Audio).
// Navegadores só liberam som depois de um toque; chame unlock() num clique.

const KEY = 'quizuu:som'
let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicBus: GainNode | null = null
let muted = (() => { try { return localStorage.getItem(KEY) === 'off' } catch { return false } })()
const listeners = new Set<(m: boolean) => void>()

// Músicas em arquivo (lobby, pergunta, pódio), passando pelo volume geral
type TrackName = 'lobby' | 'pergunta' | 'podio'
const TRACKS: Record<TrackName, { src: string; loop: boolean; vol: number }> = {
  lobby: { src: '/audio/lobby.mp3', loop: true, vol: 0.8 },
  pergunta: { src: '/audio/pergunta.mp3', loop: true, vol: 0.75 },
  podio: { src: '/audio/podio.mp3', loop: false, vol: 0.9 },
}
const tracks: Partial<Record<TrackName, { el: HTMLAudioElement; gain: GainNode | null; stop: number }>> = {}
function track(name: TrackName) {
  if (!tracks[name]) {
    const el = new Audio(TRACKS[name].src)
    el.loop = TRACKS[name].loop; el.preload = 'auto'; el.crossOrigin = 'anonymous'
    tracks[name] = { el, gain: null, stop: 0 }
  }
  return tracks[name]!
}
export function preloadLobby() { (Object.keys(TRACKS) as TrackName[]).forEach(track) }
function playTrack(name: TrackName, fromStart = false) {
  const c = ac(); if (!c || !master) return
  const t = track(name)
  if (!t.gain) { t.gain = c.createGain(); t.gain.gain.value = 0; c.createMediaElementSource(t.el).connect(t.gain).connect(master) }
  window.clearTimeout(t.stop)
  if (fromStart) t.el.currentTime = 0
  t.gain.gain.cancelScheduledValues(c.currentTime)
  t.gain.gain.setTargetAtTime(TRACKS[name].vol, c.currentTime, 0.15)
  t.el.play().catch(() => {})
}
function fadeTracks(fade: number) {
  for (const t of Object.values(tracks)) {
    if (!t || !t.gain || !ctx || t.el.paused) continue
    t.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, Math.max(fade, 0.05) / 3)
    window.clearTimeout(t.stop)
    const el = t.el
    t.stop = window.setTimeout(() => el.pause(), fade * 1000 + 400)
  }
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4
    master.connect(comp).connect(ctx.destination)
    musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master)
  }
  return ctx
}

export function unlock() { const c = ac(); if (c && c.state !== 'running') c.resume() }
export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try { localStorage.setItem(KEY, m ? 'off' : 'on') } catch { /* sem armazenamento */ }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05)
  listeners.forEach((f) => f(m))
}
export function onMuteChange(f: (m: boolean) => void) { listeners.add(f); return () => { listeners.delete(f) } }

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

function tone(midi: number, t: number, dur: number, opts: { type?: OscillatorType; vol?: number; bus?: AudioNode; attack?: number; slide?: number } = {}) {
  const c = ac(); if (!c || !master) return
  const o = c.createOscillator(), g = c.createGain()
  o.type = opts.type ?? 'triangle'
  o.frequency.setValueAtTime(hz(midi), t)
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(hz(midi + opts.slide), t + dur)
  const v = opts.vol ?? 0.2, a = opts.attack ?? 0.008
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(opts.bus ?? master)
  o.start(t); o.stop(t + dur + 0.05)
}

function noise(t: number, dur: number, vol = 0.15, freq = 1800, bus?: AudioNode) {
  const c = ac(); if (!c || !master) return
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate)
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = c.createBufferSource(); s.buffer = buf
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(bus ?? master); s.start(t)
}

function kick(t: number, bus?: AudioNode) {
  const c = ac(); if (!c || !master) return
  const o = c.createOscillator(), g = c.createGain()
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  o.connect(g).connect(bus ?? master); o.start(t); o.stop(t + 0.2)
}

export function stopMusic(fade = 0.25) {
  fadeTracks(fade)
}

// ---------- efeitos ----------
const now = () => (ac()?.currentTime ?? 0) + 0.01

export const sfx = {
  lobby: () => { stopMusic(0.1); playTrack('lobby') },
  questionMusic: () => { stopMusic(0.05); playTrack('pergunta', true) },
  join() { const t = now(); tone(79, t, 0.09, { type: 'sine', vol: 0.18, slide: 7 }); tone(86, t + 0.06, 0.12, { type: 'sine', vol: 0.12 }) },
  questionStart() {
    stopMusic(0.1)
    const t = now()
    noise(t, 0.6, 0.18, 1200)
    ;[60, 64, 67, 72].forEach((n, i) => tone(n, t + 0.08 * i, 0.25, { type: 'square', vol: 0.06 }))
    tone(84, t + 0.36, 0.5, { type: 'triangle', vol: 0.14 })
  },
  tick(last: boolean) { const t = now(); tone(last ? 88 : 84, t, 0.06, { type: 'square', vol: last ? 0.12 : 0.07 }) },
  timeUp() {
    stopMusic(0.05)
    const t = now(); [57, 64, 69, 73, 76].forEach((n) => tone(n, t, 1.6, { type: 'triangle', vol: 0.08, attack: 0.01 }))
    noise(t, 0.4, 0.1, 3000)
  },
  drumroll(seconds = 1.6) {
    stopMusic(0.1)
    const t = now(); const n = Math.floor(seconds / 0.05)
    for (let i = 0; i < n; i++) noise(t + i * 0.05, 0.06, 0.04 + (i / n) * 0.1, 900)
    noise(t + seconds, 0.5, 0.25, 4000); kick(t + seconds)
    ;[60, 64, 67, 72].forEach((m) => tone(m, t + seconds, 0.7, { type: 'square', vol: 0.05 }))
  },
  fanfare() { stopMusic(0.1); playTrack('podio', true) },

  // celular
  tap() { const t = now(); tone(76, t, 0.05, { type: 'sine', vol: 0.15 }); noise(t, 0.03, 0.05, 5000) },
  correct() { const t = now(); [72, 76, 79, 84].forEach((n, i) => tone(n, t + i * 0.07, 0.3, { type: 'triangle', vol: 0.14 })) },
  wrong() { const t = now(); tone(52, t, 0.18, { type: 'sawtooth', vol: 0.07, slide: -2 }); tone(47, t + 0.18, 0.35, { type: 'sawtooth', vol: 0.07, slide: -3 }) },
}
