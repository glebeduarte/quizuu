import { useEffect, useState } from 'react'
import { isMuted, onMuteChange, setMuted, unlock } from './sound'

export default function SoundToggle({ onEnable }: { onEnable?: () => void }) {
  const [muted, setM] = useState(isMuted())
  useEffect(() => onMuteChange(setM), [])
  return (
    <button className="sound-toggle" aria-pressed={!muted} aria-label={muted ? 'Ligar som' : 'Desligar som'}
      onClick={() => { unlock(); setMuted(!muted); if (muted) onEnable?.() }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {muted ? <path d="M16 9l5 6M21 9l-5 6" className="stroke" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" className="stroke" />}
      </svg>
      <span>{muted ? 'Som desligado' : 'Som ligado'}</span>
    </button>
  )
}
