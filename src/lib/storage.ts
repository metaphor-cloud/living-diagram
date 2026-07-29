export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** localStorage, or null where it is unavailable (private browsing, tests). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readJson<T>(storage: StorageLike | null, key: string): T | null {
  const raw = storage?.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn('storage: discarding unreadable JSON', { key })
    storage?.removeItem(key)
    return null
  }
}
