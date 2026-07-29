import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiagramStore } from '../store/diagram'
import { AUTOSAVE_KEY, initAutosave } from './autosave'
import { toEnvelopeJson } from './fileFormat'

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get: (k: string) => map.get(k),
  }
}

let cleanup: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  useDiagramStore.setState({ nodes: [], edges: [] })
})

afterEach(() => {
  cleanup?.()
  cleanup = null
  vi.useRealTimers()
})

describe('autosave', () => {
  it('restores a saved diagram on init', () => {
    useDiagramStore.getState().addNode({ label: 'Saved Before' })
    const json = toEnvelopeJson(useDiagramStore.getState().nodes, [])
    useDiagramStore.setState({ nodes: [], edges: [] })

    cleanup = initAutosave(fakeStorage({ [AUTOSAVE_KEY]: json }))
    expect(useDiagramStore.getState().nodes.map((n) => n.id)).toEqual(['saved-before'])
  })

  it('discards an unreadable autosave instead of crashing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = fakeStorage({ [AUTOSAVE_KEY]: '{broken' })
    cleanup = initAutosave(storage)
    expect(storage.get(AUTOSAVE_KEY)).toBeUndefined()
    expect(useDiagramStore.getState().nodes).toHaveLength(0)
    warn.mockRestore()
  })

  it('saves after edits, debounced', () => {
    const storage = fakeStorage()
    cleanup = initAutosave(storage)

    useDiagramStore.getState().addNode({ label: 'One' })
    useDiagramStore.getState().addNode({ label: 'Two' })
    expect(storage.get(AUTOSAVE_KEY)).toBeUndefined()

    vi.advanceTimersByTime(700)
    const saved = storage.get(AUTOSAVE_KEY)!
    expect(saved).toContain('"one"')
    expect(saved).toContain('"two"')
  })

  it('stops saving after cleanup', () => {
    const storage = fakeStorage()
    const stop = initAutosave(storage)
    stop()
    useDiagramStore.getState().addNode({ label: 'After' })
    vi.advanceTimersByTime(1000)
    expect(storage.get(AUTOSAVE_KEY)).toBeUndefined()
  })
})
