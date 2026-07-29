import { useDiagramStore } from '../store/diagram'
import { parseEnvelopeJson, toEnvelopeJson } from './fileFormat'

/**
 * Debounced localStorage autosave so a reload never loses the diagram.
 * Stored as the same envelope JSON as the file format, uncompressed
 * (localStorage is string-based).
 */
export const AUTOSAVE_KEY = 'living-diagram:autosave'
const DEBOUNCE_MS = 600

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function initAutosave(storage: StorageLike): () => void {
  const saved = storage.getItem(AUTOSAVE_KEY)
  if (saved) {
    try {
      const { nodes, edges } = parseEnvelopeJson(saved)
      useDiagramStore.getState().replaceAll(nodes, edges)
    } catch (err) {
      console.warn('autosave: discarding unreadable saved diagram', { err })
      storage.removeItem(AUTOSAVE_KEY)
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const unsubscribe = useDiagramStore.subscribe((state, prev) => {
    if (state.nodes === prev.nodes && state.edges === prev.edges) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        storage.setItem(AUTOSAVE_KEY, toEnvelopeJson(state.nodes, state.edges))
      } catch (err) {
        console.warn('autosave: write failed (storage full or unavailable)', { err })
      }
    }, DEBOUNCE_MS)
  })

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}
