import { beforeEach, describe, expect, it } from 'vitest'
import { useDiagramStore } from '../store/diagram'
import {
  deserializeDiagram,
  FileFormatError,
  parseEnvelopeJson,
  serializeDiagram,
  toEnvelopeJson,
} from './fileFormat'

beforeEach(() => {
  useDiagramStore.setState({ nodes: [], edges: [] })
})

function buildSampleDiagram() {
  const s = useDiagramStore.getState()
  s.addGroup({ label: 'VPC', color: '#0ea5e9' })
  for (let i = 0; i < 20; i++) {
    s.addNode({
      label: `Service ${i}`,
      shape: i % 2 ? 'rounded' : 'ellipse',
      parentId: 'vpc',
      color: '#dbeafe',
      description: 'a service that does things with other services',
    })
  }
  for (let i = 0; i < 19; i++) {
    s.addEdge({
      source: `service-${i}`.replace('service-0', 'service-0'),
      target: `service-${i + 1}`,
      label: 'calls',
      animated: true,
    })
  }
  return useDiagramStore.getState()
}

describe('ldgz round trip', () => {
  it('serializes and restores an identical diagram', async () => {
    const { nodes, edges } = buildSampleDiagram()
    const bytes = await serializeDiagram(nodes, edges)
    const restored = await deserializeDiagram(bytes)

    expect(restored.nodes).toHaveLength(nodes.length)
    expect(restored.edges).toHaveLength(edges.length)
    const original = nodes.find((n) => n.id === 'service-3')!
    const roundTripped = restored.nodes.find((n) => n.id === 'service-3')!
    expect(roundTripped.position).toEqual(original.position)
    expect(roundTripped.data).toEqual(original.data)
    expect(roundTripped.parentId).toBe('vpc')
    expect(restored.edges[0]!.label).toBe('calls')
  })

  it('compresses substantially versus raw JSON', async () => {
    const { nodes, edges } = buildSampleDiagram()
    const raw = new TextEncoder().encode(toEnvelopeJson(nodes, edges))
    const compressed = await serializeDiagram(nodes, edges)
    expect(compressed.byteLength).toBeLessThan(raw.byteLength * 0.35)
  })

  it('strips runtime-only state on save', () => {
    const { nodes, edges } = buildSampleDiagram()
    const dirty = nodes.map((n) => ({ ...n, selected: true, measured: { width: 1, height: 1 } }))
    const json = toEnvelopeJson(dirty, edges)
    expect(json).not.toContain('selected')
    expect(json).not.toContain('measured')
  })
})

describe('validation', () => {
  it('rejects non-gzip bytes', async () => {
    await expect(deserializeDiagram(new TextEncoder().encode('hello'))).rejects.toThrow(
      FileFormatError,
    )
  })

  it('rejects foreign JSON', () => {
    expect(() => parseEnvelopeJson('{"format":"other","version":1}')).toThrow(
      'not a Living Diagram file',
    )
  })

  it('rejects newer format versions', () => {
    expect(() =>
      parseEnvelopeJson(JSON.stringify({ format: 'living-diagram', version: 99, nodes: [], edges: [] })),
    ).toThrow('newer than this app')
  })

  it('rejects invalid nodes and dangling edges', () => {
    const nodes = [{ id: 'a', type: 'shape', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rounded' } }]
    expect(() =>
      parseEnvelopeJson(
        JSON.stringify({ format: 'living-diagram', version: 1, nodes: [{ id: 1 }], edges: [] }),
      ),
    ).toThrow('invalid node')
    expect(() =>
      parseEnvelopeJson(
        JSON.stringify({
          format: 'living-diagram',
          version: 1,
          nodes,
          edges: [{ id: 'e', source: 'a', target: 'ghost' }],
        }),
      ),
    ).toThrow('invalid edge')
  })
})
