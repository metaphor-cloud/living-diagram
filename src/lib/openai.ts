export const OPENAI_BASE = 'https://api.openai.com/v1'

/** Cheap key sanity check against GET /v1/models. */
export async function validateApiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${OPENAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.ok) return { ok: true }
    if (res.status === 401) return { ok: false, error: 'OpenAI rejected this key (401).' }
    return { ok: false, error: `OpenAI returned ${res.status} while checking the key.` }
  } catch {
    return { ok: false, error: 'Could not reach api.openai.com to check the key.' }
  }
}

export async function openaiJson<T>(key: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${OPENAI_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const err = (await res.json()) as { error?: { message?: string } }
      if (err.error?.message) detail = `${res.status}: ${err.error.message}`
    } catch {
      // non-JSON error body; status alone will have to do
    }
    throw new Error(`OpenAI request failed (${detail})`)
  }
  return (await res.json()) as T
}
