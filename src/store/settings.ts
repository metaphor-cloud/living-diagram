import { create } from 'zustand'
import { DEFAULT_CHAT_MODEL, DEFAULT_REALTIME_MODEL } from '../lib/models'
import { browserStorage, type StorageLike } from '../lib/storage'

/**
 * The OpenAI API key lives in memory only, unless the user explicitly opts
 * in to persisting it in localStorage. It is only ever sent to
 * api.openai.com - the app has no backend.
 */
const KEY_STORAGE = 'living-diagram:openai-key'
const CHAT_MODEL_STORAGE = 'living-diagram:chat-model'
const REALTIME_MODEL_STORAGE = 'living-diagram:realtime-model'
const MINIMAP_STORAGE = 'living-diagram:show-minimap'

type SettingsState = {
  apiKey: string | null
  /** Whether the current key is persisted in localStorage. */
  keyPersisted: boolean
  chatModel: string
  realtimeModel: string
  showMinimap: boolean
  setApiKey: (key: string, persist: boolean) => void
  clearApiKey: () => void
  setChatModel: (model: string) => void
  setRealtimeModel: (model: string) => void
  setShowMinimap: (show: boolean) => void
}

export function createSettings(storage: StorageLike | null = browserStorage()) {
  return create<SettingsState>((set) => ({
    apiKey: storage?.getItem(KEY_STORAGE) ?? null,
    keyPersisted: Boolean(storage?.getItem(KEY_STORAGE)),
    chatModel: storage?.getItem(CHAT_MODEL_STORAGE) ?? DEFAULT_CHAT_MODEL,
    realtimeModel: storage?.getItem(REALTIME_MODEL_STORAGE) ?? DEFAULT_REALTIME_MODEL,
    showMinimap: storage?.getItem(MINIMAP_STORAGE) !== 'false',

    setApiKey: (key, persist) => {
      if (persist) storage?.setItem(KEY_STORAGE, key)
      else storage?.removeItem(KEY_STORAGE)
      set({ apiKey: key, keyPersisted: persist })
    },

    clearApiKey: () => {
      storage?.removeItem(KEY_STORAGE)
      set({ apiKey: null, keyPersisted: false })
    },

    setChatModel: (model) => {
      storage?.setItem(CHAT_MODEL_STORAGE, model)
      set({ chatModel: model })
    },

    setRealtimeModel: (model) => {
      storage?.setItem(REALTIME_MODEL_STORAGE, model)
      set({ realtimeModel: model })
    },

    setShowMinimap: (show) => {
      storage?.setItem(MINIMAP_STORAGE, String(show))
      set({ showMinimap: show })
    },
  }))
}

export const useSettingsStore = createSettings()
