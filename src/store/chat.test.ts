import { describe, expect, it } from 'vitest'
import { createChat, type ChatMessage } from './chat'

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  }
}

const KEY = 'living-diagram:chat'

describe('chat persistence', () => {
  it('restores transcript and conversation chain from storage', () => {
    const messages: ChatMessage[] = [
      { kind: 'user', text: 'hi' },
      { kind: 'assistant', text: 'hello' },
    ]
    const storage = fakeStorage({
      [KEY]: JSON.stringify({ messages, lastResponseId: 'resp_42' }),
    })
    const store = createChat(storage)
    expect(store.getState().messages).toEqual(messages)
    expect(store.getState().lastResponseId).toBe('resp_42')
  })

  it('starts empty when storage holds junk', () => {
    const store = createChat(fakeStorage({ [KEY]: '{broken' }))
    expect(store.getState().messages).toEqual([])
    expect(store.getState().lastResponseId).toBeNull()
  })

  it('reset clears state and storage', () => {
    const storage = fakeStorage({
      [KEY]: JSON.stringify({ messages: [{ kind: 'user', text: 'x' }], lastResponseId: 'r' }),
    })
    const store = createChat(storage)
    store.getState().reset()
    expect(store.getState().messages).toEqual([])
    expect(store.getState().lastResponseId).toBeNull()
    expect(storage.dump()).toEqual({})
  })

  it('send without an api key persists the error hint', async () => {
    const storage = fakeStorage()
    const store = createChat(storage)
    await store.getState().send('hello')
    expect(store.getState().messages[0]).toMatchObject({ kind: 'error' })
    const saved = JSON.parse(storage.dump()[KEY]!)
    expect(saved.messages).toHaveLength(1)
  })
})
