import { useState } from 'react'
import { useSettingsStore } from '../store/settings'
import { useVoiceStore } from '../store/voice'
import { FileMenu } from './FileMenu'
import { KeyDialog } from './KeyDialog'

export function TopBar() {
  const apiKey = useSettingsStore((s) => s.apiKey)
  const { status, mode, connect, disconnect } = useVoiceStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const active = status === 'live' || status === 'connecting'
  const toggle = (target: 'voice' | 'meeting') => {
    if (active && mode === target) disconnect()
    else void connect(target)
  }

  return (
    <header className="topbar">
      <div className="topbar__title">
        <span className="topbar__logo">◈</span> Living Diagram
      </div>
      <div className="topbar__actions">
        <FileMenu />
        <button
          className={`btn ${active && mode === 'voice' ? 'btn--live' : ''}`}
          disabled={!apiKey}
          title={apiKey ? 'Talk to the diagram' : 'Set your API key first'}
          onClick={() => toggle('voice')}
        >
          🎙 Voice
        </button>
        <button
          className={`btn ${active && mode === 'meeting' ? 'btn--live' : ''}`}
          disabled={!apiKey}
          title={
            apiKey
              ? 'Passively listen to a meeting and keep the diagram in sync'
              : 'Set your API key first'
          }
          onClick={() => toggle('meeting')}
        >
          👂 Meeting
        </button>
        <button
          className={apiKey ? 'btn' : 'btn btn--primary'}
          onClick={() => setSettingsOpen(true)}
        >
          {apiKey ? 'Settings' : 'Set API key'}
        </button>
      </div>
      {settingsOpen && <KeyDialog onClose={() => setSettingsOpen(false)} />}
    </header>
  )
}
