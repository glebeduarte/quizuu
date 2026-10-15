// Quizuu · trilha sonora sintetizada no navegador (Web Audio). Nenhum arquivo de áudio.
// Navegadores só liberam som depois de um toque; chame unlock() num clique.

type Loop = 'lobby' | 'question' | null

const KEY = 'quizuu:som'
let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicBus: GainNode | null = null
let muted = (() => { try { return localStorage.getItem(KEY) === 'off' } catch { return false } })()
let current: Loop = null
let timer = 0
let nextTime = 0
let step = 0
const listeners = new Set<(m: boolean) => void>()

// Música de espera do lobby: arquivo próprio, em loop, passando pelo volume geral
let lobbyEl: HTMLAudioElement | null = null
let lobbyGain: GainNode | null = null
let lobbyStop = 0
export function preloadLobby() {
  if (lobbyEl) return
  lobbyEl = new Audio('/audio/lobby.mp3')
  lobbyEl.loop = true; lobbyEl.preload = 'auto'; lobbyEl.crossOrigin = 'anonymous'
}
function lobbyStart() {
  const c = ac(); if (!c || !master) return
  preloadLobby()
  if (!lobbyGain) {
    lobbyGain = c.createGain(); lobbyGain.gain.value = 0
    c.createMediaElementSource(lobbyEl!).connect(lobbyGain).connect(master)
  }
  window.clearTimeout(lobbyStop)
  lobbyGain.gain.cancelScheduledValues(c.currentTime)
  lobbyGain.gain.setTargetAtTime(0.8, c.currentTime, 0.4)
  lobbyEl!.play().catch(() => {})
}
function lobbyFade(fade: number) {
  if (!lobbyEl || !lobbyGain || !ctx || lobbyEl.paused) return
  lobbyGain.gain.setTargetAtTime(0.0001, ctx.currentTime, Math.max(fade, 0.05) / 3)
  window.clearTimeout(lobbyStop)
  lobbyStop = window.setTimeout(() => lobbyEl?.pause(), fade * 1000 + 400)
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

// ---------- músicas em loop ----------
// Lobby: groove alegre em Fá maior, 116 bpm, 16 passos por compasso
const LOBBY_CHORDS = [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]] // F, Dm, Bb, C
const LOBBY_MEL = [72, null, 69, 72, 74, null, 72, null, 69, null, 67, 69, 65, null, null, null]
// Pergunta: pulso tenso em Lá menor, 132 bpm
const Q_BASS = [45, 45, 57, 45, 48, 48, 60, 48, 43, 43, 55, 43, 44, 44, 56, 44]

function schedule() {
  const c = ac(); if (!c || !current) return
  const bpm = current === 'lobby' ? 116 : 132
  const sixteenth = 60 / bpm / 4
  while (nextTime < c.currentTime + 0.15) {
    const s = step % 64, inBar = s % 16, bar = Math.floor(s / 16), t = nextTime
    if (current === 'lobby') {
      if (inBar % 4 === 0) kick(t, musicBus!)
      if (inBar % 4 === 2) noise(t, 0.05, 0.06, 7000, musicBus!)
      if (inBar === 4 || inBar === 12) noise(t, 0.12, 0.12, 2200, musicBus!)
      const ch = LOBBY_CHORDS[bar]
      if (inBar % 2 === 0) tone(ch[0] - 12, t, sixteenth * 1.8, { type: 'sine', vol: 0.22, bus: musicBus! })
      if ([2, 6, 10, 14].includes(inBar)) ch.forEach((n) => tone(n + 12, t, sixteenth * 1.5, { type: 'square', vol: 0.025, bus: musicBus! }))
      const m = LOBBY_MEL[inBar]
      if (m && bar % 2 === 1) tone(m + (bar === 3 ? 2 : 0), t, sixteenth * 2.2, { type: 'triangle', vol: 0.09, bus: musicBus! })
    } else {
      if (inBar % 4 === 0) kick(t, musicBus!)
      noise(t, 0.03, inBar % 2 ? 0.03 : 0.05, 8000, musicBus!)
      tone(Q_BASS[inBar] + (bar % 2 ? 0 : 0), t, sixteenth * 0.9, { type: 'sawtooth', vol: 0.06, bus: musicBus! })
      if (inBar % 8 === 0) tone(bar % 2 ? 76 : 72, t, sixteenth * 7, { type: 'triangle', vol: 0.05, bus: musicBus!, attack: 0.05 })
    }
    nextTime += sixteenth; step++
  }
}

function startLoop(kind: Exclude<Loop, null>) {
  const c = ac(); if (!c) return
  if (current === kind) return
  stopMusic()
  current = kind; step = 0; nextTime = c.currentTime + 0.05
  if (musicBus) { musicBus.gain.cancelScheduledValues(c.currentTime); musicBus.gain.setValueAtTime(0.55, c.currentTime) }
  timer = window.setInterval(schedule, 40); schedule()
}

export function stopMusic(fade = 0.25) {
  lobbyFade(fade)
  window.clearInterval(timer); timer = 0
  if (current && ctx && musicBus) {
    musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3)
    const bus = musicBus
    musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master!)
    setTimeout(() => bus.disconnect(), fade * 1000 + 300)
  }
  current = null
}

// ---------- efeitos ----------
const now = () => (ac()?.currentTime ?? 0) + 0.01

export const sfx = {
  lobby: () => { stopMusic(0.1); lobbyStart() },
  questionMusic: () => startLoop('question'),
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
  fanfare() {
    stopMusic(0.1)
    const t = now()
    const notes: [number, number, number][] = [[67, 0, 0.14], [67, 0.15, 0.14], [67, 0.3, 0.14], [72, 0.45, 0.5], [76, 0.95, 0.2], [74, 1.15, 0.2], [76, 1.35, 0.25], [79, 1.6, 1.2]]
    notes.forEach(([n, d, l]) => { tone(n, t + d, l, { type: 'square', vol: 0.07 }); tone(n - 12, t + d, l, { type: 'triangle', vol: 0.1 }) })
    ;[48, 55, 60, 64].forEach((n) => tone(n, t + 1.6, 1.6, { type: 'triangle', vol: 0.07 }))
    for (let i = 0; i < 6; i++) noise(t + 1.6 + i * 0.12, 0.3, 0.08, 6000 + i * 500)
  },
  // celular
  tap() { const t = now(); tone(76, t, 0.05, { type: 'sine', vol: 0.15 }); noise(t, 0.03, 0.05, 5000) },
  correct() { const t = now(); [72, 76, 79, 84].forEach((n, i) => tone(n, t + i * 0.07, 0.3, { type: 'triangle', vol: 0.14 })) },
  wrong() { const t = now(); tone(52, t, 0.18, { type: 'sawtooth', vol: 0.07, slide: -2 }); tone(47, t + 0.18, 0.35, { type: 'sawtooth', vol: 0.07, slide: -3 }) },
}
