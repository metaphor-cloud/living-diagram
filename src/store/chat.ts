import { create } from 'zustand'
import { CHAT_INSTRUCTIONS, runChatTurn, type ResponsesResult } from '../lib/chat'
import { openaiJson } from '../lib/openai'
import { browserStorage, readJson, type StorageLike } from '../lib/storage'
import { executeToolFromJson, toOpenAITools } from '../tools/registry'
import { useSettingsStore } from './settings'

export type ChatMessage =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; ok: boolean; detail: string }
  | { kind: 'error'; text: string }

type ChatState = {
  messages: ChatMessage[]
  busy: boolean
  lastResponseId: string | null
  send: (text: string) => Promise<void>
  reset: () => void
}

/**
 * Transcript and conversation chain persist in localStorage so a refresh
 * keeps the whole session; the Clear button resets both.
 */
const CHAT_STORAGE = 'living-diagram:chat'
const MAX_SAVED_MESSAGES = 200

type SavedChat = { messages: ChatMessage[]; lastResponseId: string | null }

function summarizeArgs(argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>
    const parts = Object.entries(args)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    return parts.join(', ')
  } catch {
    return ''
  }
}

export function createChat(storage: StorageLike | null = browserStorage()) {
  const saved = readJson<SavedChat>(storage, CHAT_STORAGE)

  return create<ChatState>((set, get) => {
    const setAndSave = (partial: Partial<Pick<ChatState, 'messages' | 'lastResponseId'>>) => {
      set(partial)
      const { messages, lastResponseId } = get()
      try {
        storage?.setItem(
          CHAT_STORAGE,
          JSON.stringify({
            messages: messages.slice(-MAX_SAVED_MESSAGES),
            lastResponseId,
          } satisfies SavedChat),
        )
      } catch (err) {
        console.warn('chat: persist failed (storage full or unavailable)', { err })
      }
    }

    return {
      messages: Array.isArray(saved?.messages) ? saved.messages : [],
      busy: false,
      lastResponseId: saved?.lastResponseId ?? null,

      send: async (text) => {
        const trimmed = text.trim()
        if (!trimmed || get().busy) return
        const { apiKey, chatModel } = useSettingsStore.getState()
        if (!apiKey) {
          setAndSave({
            messages: [
              ...get().messages,
              { kind: 'error', text: 'Set your OpenAI API key first (top right).' },
            ],
          })
          return
        }

        set({ busy: true })
        setAndSave({ messages: [...get().messages, { kind: 'user', text: trimmed }] })
        try {
          const turn = await runChatTurn(
            {
              post: (body) => openaiJson<ResponsesResult>(apiKey, '/responses', body),
              execute: executeToolFromJson,
            },
            {
              model: chatModel,
              instructions: CHAT_INSTRUCTIONS,
              tools: toOpenAITools(),
              userText: trimmed,
              previousResponseId: get().lastResponseId,
              onEvent: (event) => {
                setAndSave({
                  messages: [
                    ...get().messages,
                    {
                      kind: 'tool',
                      name: event.name,
                      ok: event.result.ok,
                      detail: event.result.ok
                        ? summarizeArgs(event.args)
                        : event.result.error,
                    },
                  ],
                })
              },
            },
          )
          setAndSave({
            lastResponseId: turn.responseId,
            messages: [
              ...get().messages,
              { kind: 'assistant', text: turn.assistantText || '(done)' },
            ],
          })
        } catch (err) {
          console.error('chat turn failed', err)
          setAndSave({
            messages: [
              ...get().messages,
              { kind: 'error', text: err instanceof Error ? err.message : 'Chat request failed.' },
            ],
          })
        } finally {
          set({ busy: false })
        }
      },

      reset: () => {
        storage?.removeItem(CHAT_STORAGE)
        set({ messages: [], lastResponseId: null })
      },
    }
  })
}

export const useChatStore = createChat()
