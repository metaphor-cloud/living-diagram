import { create } from 'zustand'
import { RealtimeClient } from '../lib/realtime/client'
import type { RealtimeMode } from '../lib/realtime/session'
import { onToolCall } from '../tools/registry'
import { useSettingsStore } from './settings'

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error'

export type VoiceEntry = {
  kind: 'user' | 'assistant' | 'action' | 'error'
  text: string
}

type VoiceState = {
  status: VoiceStatus
  mode: RealtimeMode | null
  entries: VoiceEntry[]
  error: string | null
  connect: (mode: RealtimeMode) => Promise<void>
  disconnect: () => void
}

let client: RealtimeClient | null = null
let unsubscribeToolFeed: (() => void) | null = null

const MAX_ENTRIES = 200

export const useVoiceStore = create<VoiceState>((set, get) => {
  const push = (entry: VoiceEntry) =>
    set({ entries: [...get().entries, entry].slice(-MAX_ENTRIES) })

  return {
    status: 'idle',
    mode: null,
    entries: [],
    error: null,

    connect: async (mode) => {
      const { apiKey, realtimeModel } = useSettingsStore.getState()
      if (!apiKey) {
        set({ status: 'error', error: 'Set your OpenAI API key first.' })
        return
      }
      get().disconnect()
      set({ mode, status: 'connecting', entries: [], error: null })

      unsubscribeToolFeed = onToolCall((event) => {
        push({
          kind: event.result.ok ? 'action' : 'error',
          text: event.result.ok
            ? `${event.tool} ${JSON.stringify(event.args)}`
            : `${event.tool} failed: ${event.result.error}`,
        })
      })

      client = new RealtimeClient(mode, {
        onStatus: (status) => {
          if (status === 'live') set({ status: 'live' })
          if (status === 'closed' && get().status !== 'error' && get().status !== 'idle') {
            set({ status: 'idle', mode: null })
          }
        },
        onUserTranscript: (text) => push({ kind: 'user', text }),
        onAssistantText: (text) => {
          // Meeting mode answers "noop" when nothing warrants a change.
          if (get().mode === 'meeting' && text.trim().toLowerCase() === 'noop') return
          push({ kind: 'assistant', text })
        },
        onError: (message) => {
          push({ kind: 'error', text: message })
          set({ error: message })
        },
      })

      try {
        await client.connect(apiKey, realtimeModel)
      } catch (err) {
        set({
          status: 'error',
          error: err instanceof Error ? err.message : 'Could not start the session.',
        })
      }
    },

    disconnect: () => {
      unsubscribeToolFeed?.()
      unsubscribeToolFeed = null
      client?.disconnect()
      client = null
      set({ status: 'idle', mode: null })
    },
  }
})
