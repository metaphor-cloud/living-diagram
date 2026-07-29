import type { DiagramEdge, DiagramNode } from '../types/diagram'

/**
 * .ldgz - the Living Diagram file format: a versioned JSON envelope,
 * gzip-compressed with the browser-native CompressionStream. Runtime-only
 * React Flow state (selection, drag, measurements) is stripped on save so
 * files stay small and diff-stable.
 */

export const FILE_EXTENSION = '.ldgz'
export const FORMAT_NAME = 'living-diagram'
export const FORMAT_VERSION = 1

type Envelope = {
  format: typeof FORMAT_NAME
  version: number
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

export class FileFormatError extends Error {}

function stripNode(node: DiagramNode): DiagramNode {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
    ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
  } as DiagramNode
}

function stripEdge(edge: DiagramEdge): DiagramEdge {
  const out: DiagramEdge = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }
  if (edge.sourceHandle != null) out.sourceHandle = edge.sourceHandle
  if (edge.targetHandle != null) out.targetHandle = edge.targetHandle
  if (edge.label !== undefined) out.label = edge.label
  if (edge.type !== undefined) out.type = edge.type
  if (edge.animated) out.animated = edge.animated
  if (edge.style !== undefined) out.style = edge.style
  if (edge.markerStart !== undefined) out.markerStart = edge.markerStart
  if (edge.markerEnd !== undefined) out.markerEnd = edge.markerEnd
  return out
}

export function toEnvelopeJson(nodes: DiagramNode[], edges: DiagramEdge[]): string {
  const envelope: Envelope = {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    nodes: nodes.map(stripNode),
    edges: edges.map(stripEdge),
  }
  return JSON.stringify(envelope)
}

export function parseEnvelopeJson(json: string): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new FileFormatError('file does not contain valid JSON')
  }
  const env = raw as Partial<Envelope>
  if (env.format !== FORMAT_NAME) {
    throw new FileFormatError('not a Living Diagram file')
  }
  if (typeof env.version !== 'number' || env.version > FORMAT_VERSION) {
    throw new FileFormatError(
      `file version ${String(env.version)} is newer than this app understands (${FORMAT_VERSION})`,
    )
  }
  if (!Array.isArray(env.nodes) || !Array.isArray(env.edges)) {
    throw new FileFormatError('file is missing nodes or edges')
  }
  for (const node of env.nodes) {
    if (
      typeof node?.id !== 'string' ||
      (node.type !== 'shape' && node.type !== 'group') ||
      typeof node.position?.x !== 'number' ||
      typeof node.position?.y !== 'number' ||
      typeof node.data?.label !== 'string'
    ) {
      throw new FileFormatError('file contains an invalid node')
    }
  }
  const nodeIds = new Set(env.nodes.map((n) => n.id))
  for (const edge of env.edges) {
    if (
      typeof edge?.id !== 'string' ||
      !nodeIds.has(edge.source as string) ||
      !nodeIds.has(edge.target as string)
    ) {
      throw new FileFormatError('file contains an invalid edge')
    }
  }
  return { nodes: env.nodes, edges: env.edges }
}

async function pipeThrough(
  data: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function serializeDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Promise<Uint8Array> {
  const json = new TextEncoder().encode(toEnvelopeJson(nodes, edges))
  return pipeThrough(json, new CompressionStream('gzip'))
}

export async function deserializeDiagram(
  data: ArrayBuffer | Uint8Array,
): Promise<{ nodes: DiagramNode[]; edges: DiagramEdge[] }> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let decompressed: Uint8Array
  try {
    decompressed = await pipeThrough(bytes, new DecompressionStream('gzip'))
  } catch {
    throw new FileFormatError('file is not gzip-compressed - not a Living Diagram file')
  }
  return parseEnvelopeJson(new TextDecoder().decode(decompressed))
}
