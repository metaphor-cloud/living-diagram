import { useEffect, useRef } from 'react'
import { useVoiceStore } from '../store/voice'

const STATUS_LABEL = {
  idle: '',
  connecting: 'connecting…',
  live: 'live',
  error: 'error',
} as const

export function VoiceDock() {
  const { status, mode, sourceLabel, entries, error, disconnect } = useVoiceStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries])

  if (status === 'idle') return null

  return (
    <div className="voicedock">
      <div className="voicedock__header">
        <span className={`voicedock__dot voicedock__dot--${status}`} />
        <span className="voicedock__title">
          {mode === 'meeting' ? 'Meeting mode' : 'Voice'}
          {mode === 'meeting' && sourceLabel ? ` (${sourceLabel})` : ''} · {STATUS_LABEL[status]}
        </span>
        <button className="btn btn--small" onClick={disconnect}>
          Stop
        </button>
      </div>
      {mode === 'meeting' && status === 'live' && (
        <p className="voicedock__hint">Listening passively - diagram updates appear as the conversation warrants.</p>
      )}
      {error && <p className="voicedock__error">{error}</p>}
      <div className="voicedock__entries" ref={scrollRef}>
        {entries.map((e, i) => (
          <div key={i} className={`voicedock__entry voicedock__entry--${e.kind}`}>
            {e.kind === 'user' && '🗣 '}
            {e.kind === 'assistant' && '🤖 '}
            {e.kind === 'action' && '⚙ '}
            {e.kind === 'error' && '⚠ '}
            {e.text}
          </div>
        ))}
      </div>
    </div>
  )
}
