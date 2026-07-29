import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_MODELS } from '../lib/models'
import { browserStorage } from '../lib/storage'
import { useChatStore } from '../store/chat'
import { useSettingsStore } from '../store/settings'

const WIDTH_KEY = 'living-diagram:chat-width'
const MIN_WIDTH = 240
const MAX_WIDTH = 800

function savedWidth(): number {
  const value = Number(browserStorage()?.getItem(WIDTH_KEY))
  return value >= MIN_WIDTH && value <= MAX_WIDTH ? value : 340
}

export function ChatPanel() {
  const { messages, busy, send, reset } = useChatStore()
  const apiKey = useSettingsStore((s) => s.apiKey)
  const chatModel = useSettingsStore((s) => s.chatModel)
  const setChatModel = useSettingsStore((s) => s.setChatModel)
  const [draft, setDraft] = useState('')
  const [width, setWidth] = useState(savedWidth)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy])

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    setWidth((startWidth) => {
      const move = (ev: PointerEvent) => {
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)))
        setWidth(next)
        browserStorage()?.setItem(WIDTH_KEY, String(next))
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      return startWidth
    })
  }, [])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void send(text)
  }

  return (
    <aside className="chat" style={{ width }}>
      <div className="chat__resizer" onPointerDown={startResize} />
      <div className="chat__header">
        <span className="chat__title">Chat</span>
        <select
          className="chat__model"
          value={chatModel}
          onChange={(e) => setChatModel(e.target.value)}
          title="Text model"
        >
          {CHAT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
          {!CHAT_MODELS.some((m) => m.id === chatModel) && (
            <option value={chatModel}>{chatModel}</option>
          )}
        </select>
        <button className="btn btn--small" onClick={reset} disabled={busy || messages.length === 0}>
          Clear
        </button>
      </div>

      <div className="chat__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="chat__empty">
            Ask about the diagram or tell me to change it - "add a load balancer in front of the
            two api servers", "what talks to the database?", "group these into a VPC".
          </p>
        )}
        {messages.map((m, i) => {
          switch (m.kind) {
            case 'user':
              return (
                <div key={i} className="chat__bubble chat__bubble--user">
                  {m.text}
                </div>
              )
            case 'assistant':
              return (
                <div key={i} className="chat__bubble chat__bubble--assistant">
                  {m.text}
                </div>
              )
            case 'tool':
              return (
                <div key={i} className={`chat__tool ${m.ok ? '' : 'chat__tool--error'}`}>
                  ⚙ {m.name}
                  {m.detail ? ` · ${m.detail}` : ''}
                </div>
              )
            case 'error':
              return (
                <div key={i} className="chat__bubble chat__bubble--error">
                  {m.text}
                </div>
              )
          }
        })}
        {busy && <div className="chat__thinking">thinking…</div>}
      </div>

      <div className="chat__composer">
        <textarea
          rows={2}
          placeholder={apiKey ? 'Talk to the diagram…' : 'Set your API key to start chatting'}
          value={draft}
          disabled={!apiKey || busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button className="btn btn--primary" onClick={submit} disabled={!apiKey || busy || !draft.trim()}>
          Send
        </button>
      </div>
    </aside>
  )
}
