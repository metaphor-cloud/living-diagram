import { useState } from 'react'
import { AUTOSAVE_KEY } from '../lib/autosave'
import { validateApiKey } from '../lib/openai'
import { CHAT_MODELS, REALTIME_MODELS } from '../lib/models'
import { browserStorage } from '../lib/storage'
import { useChatStore } from '../store/chat'
import { useDiagramStore } from '../store/diagram'
import { useSettingsStore } from '../store/settings'

export function KeyDialog({ onClose }: { onClose: () => void }) {
  const {
    apiKey,
    keyPersisted,
    setApiKey,
    clearApiKey,
    chatModel,
    setChatModel,
    realtimeModel,
    setRealtimeModel,
    showMinimap,
    setShowMinimap,
  } = useSettingsStore()
  const [draft, setDraft] = useState('')
  const [persist, setPersist] = useState(keyPersisted)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const key = draft.trim()
    if (!key) return
    setBusy(true)
    setError(null)
    const check = await validateApiKey(key)
    setBusy(false)
    if (!check.ok) {
      setError(check.error ?? 'Key check failed.')
      return
    }
    setApiKey(key, persist)
    setDraft('')
    onClose()
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <section>
          <h3>OpenAI API key</h3>
          <p className="dialog__note">
            Your key stays in this browser and is sent only to <code>api.openai.com</code>. This
            page has no backend. Session-only by default; ticking "remember" stores it in
            localStorage on this device.
          </p>
          {apiKey ? (
            <p className="dialog__keystate">
              Key set (…{apiKey.slice(-4)}){keyPersisted ? ', remembered on this device' : ', this session only'}.{' '}
              <button className="btn btn--danger" onClick={clearApiKey}>
                Forget key
              </button>
            </p>
          ) : (
            <p className="dialog__keystate">No key set.</p>
          )}
          <div className="dialog__row">
            <input
              type="password"
              placeholder="sk-..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
            />
            <button className="btn btn--primary" disabled={busy || !draft.trim()} onClick={() => void save()}>
              {busy ? 'Checking…' : 'Save'}
            </button>
          </div>
          <label className="dialog__check">
            <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
            Remember on this device (localStorage)
          </label>
          {error && <p className="dialog__error">{error}</p>}
        </section>

        <section>
          <h3>Models</h3>
          <div className="dialog__row">
            <label>
              Text chat
              <select value={chatModel} onChange={(e) => setChatModel(e.target.value)}>
                {CHAT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {!CHAT_MODELS.some((m) => m.id === chatModel) && (
                  <option value={chatModel}>{chatModel}</option>
                )}
              </select>
            </label>
            <label>
              Voice
              <select value={realtimeModel} onChange={(e) => setRealtimeModel(e.target.value)}>
                {REALTIME_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {!REALTIME_MODELS.some((m) => m.id === realtimeModel) && (
                  <option value={realtimeModel}>{realtimeModel}</option>
                )}
              </select>
            </label>
          </div>
        </section>

        <section>
          <h3>Canvas</h3>
          <label className="dialog__check">
            <input
              type="checkbox"
              checked={showMinimap}
              onChange={(e) => setShowMinimap(e.target.checked)}
            />
            Show minimap
          </label>
          <p className="dialog__keystate">
            <button
              className="btn btn--danger"
              onClick={() => {
                if (!window.confirm('Reset the diagram and chat? This cannot be undone.')) return
                useDiagramStore.getState().clear()
                useChatStore.getState().reset()
                browserStorage()?.removeItem(AUTOSAVE_KEY)
              }}
            >
              Reset diagram
            </button>{' '}
            Clears the canvas, the chat and the autosave.
          </p>
        </section>

        <div className="dialog__actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
