/**
 * Human-readable ids derived from labels ("API Server" -> "api-server"),
 * suffixed on collision. Readable ids keep tool calls and AI references
 * to nodes short and unambiguous.
 */
export function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'node'
}

export function uniqueId(label: string, taken: Iterable<string>): string {
  const existing = new Set(taken)
  const base = slugify(label)
  if (!existing.has(base)) return base
  let n = 2
  while (existing.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
