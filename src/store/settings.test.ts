import { describe, expect, it } from 'vitest'
import { createSettings } from './settings'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => [...map.entries()],
  }
}

describe('settings store', () => {
  it('keeps the key in memory only unless persistence is requested', () => {
    const storage = fakeStorage()
    const store = createSettings(storage)
    store.getState().setApiKey('sk-test-123', false)
    expect(store.getState().apiKey).toBe('sk-test-123')
    expect(store.getState().keyPersisted).toBe(false)
    expect(storage.dump().some(([, v]) => v.includes('sk-test'))).toBe(false)
  })

  it('persists and restores the key when opted in', () => {
    const storage = fakeStorage()
    const store = createSettings(storage)
    store.getState().setApiKey('sk-keep-me', true)
    expect(store.getState().keyPersisted).toBe(true)

    const rehydrated = createSettings(storage)
    expect(rehydrated.getState().apiKey).toBe('sk-keep-me')
    expect(rehydrated.getState().keyPersisted).toBe(true)
  })

  it('turning persistence off on a later save removes the stored key', () => {
    const storage = fakeStorage()
    const store = createSettings(storage)
    store.getState().setApiKey('sk-keep-me', true)
    store.getState().setApiKey('sk-session-only', false)
    const rehydrated = createSettings(storage)
    expect(rehydrated.getState().apiKey).toBeNull()
  })

  it('clearApiKey wipes memory and storage', () => {
    const storage = fakeStorage()
    const store = createSettings(storage)
    store.getState().setApiKey('sk-gone', true)
    store.getState().clearApiKey()
    expect(store.getState().apiKey).toBeNull()
    expect(storage.dump()).toHaveLength(0)
  })

  it('remembers model choices', () => {
    const storage = fakeStorage()
    const store = createSettings(storage)
    store.getState().setChatModel('gpt-5.6-sol')
    store.getState().setRealtimeModel('gpt-realtime-2.1-mini')
    const rehydrated = createSettings(storage)
    expect(rehydrated.getState().chatModel).toBe('gpt-5.6-sol')
    expect(rehydrated.getState().realtimeModel).toBe('gpt-realtime-2.1-mini')
  })

  it('works without any storage (private browsing)', () => {
    const store = createSettings(null)
    store.getState().setApiKey('sk-mem', true)
    expect(store.getState().apiKey).toBe('sk-mem')
  })
})
