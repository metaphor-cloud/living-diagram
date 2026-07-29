import { useState } from 'react'
import type { AudioSourceKind } from '../lib/realtime/audio'
import { useSettingsStore } from '../store/settings'
import { useVoiceStore } from '../store/voice'
import { FileMenu } from './FileMenu'
import { KeyDialog } from './KeyDialog'

const MEETING_SOURCES: { kind: AudioSourceKind; label: string; hint: string }[] = [
  {
    kind: 'microphone',
    label: '🎤 Microphone',
    hint: 'In-person meetings: the mic hears the room.',
  },
  {
    kind: 'tab',
    label: '🖥 Meeting tab audio',
    hint: 'Online meetings you are only watching: pick the meeting tab and tick "Also share tab audio". Chrome/Edge only.',
  },
  {
    kind: 'mix',
    label: '🎤+🖥 Mic + tab audio',
    hint: 'Online meetings you speak in: hears you through the mic and everyone else through the tab. Chrome/Edge only.',
  },
]

export function TopBar() {
  const apiKey = useSettingsStore((s) => s.apiKey)
  const { status, mode, connect, disconnect } = useVoiceStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [meetingMenuOpen, setMeetingMenuOpen] = useState(false)

  const active = status === 'live' || status === 'connecting'

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
          onClick={() => {
            if (active && mode === 'voice') disconnect()
            else void connect('voice')
          }}
        >
          🎙 Voice
        </button>
        <div className="filemenu">
          <button
            className={`btn ${active && mode === 'meeting' ? 'btn--live' : ''}`}
            disabled={!apiKey}
            title={
              apiKey
                ? 'Passively listen to a meeting and keep the diagram in sync'
                : 'Set your API key first'
            }
            onClick={() => {
              if (active && mode === 'meeting') disconnect()
              else setMeetingMenuOpen((o) => !o)
            }}
          >
            {active && mode === 'meeting' ? '👂 Stop meeting' : '👂 Meeting ▾'}
          </button>
          {meetingMenuOpen && (
            <>
              <div className="filemenu__backdrop" onClick={() => setMeetingMenuOpen(false)} />
              <div className="filemenu__list filemenu__list--wide">
                {MEETING_SOURCES.map((s) => (
                  <button
                    key={s.kind}
                    onClick={() => {
                      setMeetingMenuOpen(false)
                      void connect('meeting', s.kind)
                    }}
                  >
                    <span className="filemenu__optlabel">{s.label}</span>
                    <span className="filemenu__opthint">{s.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
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
