import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiagramStore } from '../store/diagram'
import { diagramTools, executeTool, executeToolFromJson, onToolCall, toOpenAITools } from './registry'

beforeEach(() => {
  useDiagramStore.setState({ nodes: [], edges: [] })
})

function ok(name: string, args: unknown = {}): any {
  const result = executeTool(name, args)
  if (!result.ok) throw new Error(`${name} failed: ${result.error}`)
  return result.result
}

describe('write tools', () => {
  it('builds a small diagram end to end', () => {
    const api = ok('add_node', { label: 'API', shape: 'rectangle', color: '#dbeafe' })
    const db = ok('add_node', { label: 'Database', shape: 'ellipse', icon: '🗄️' })
    const edge = ok('add_edge', { source: api.id, target: db.id, label: 'reads', animated: true })
    expect(api.id).toBe('api')
    expect(db.id).toBe('database')
    expect(edge.id).toBeTruthy()

    const described = ok('describe_diagram')
    expect(described.node_count).toBe(2)
    expect(described.edges[0].label).toBe('reads')
  })

  it('update_node and update_edge patch through the registry', () => {
    ok('add_node', { label: 'A' })
    ok('add_node', { label: 'B' })
    const edge = ok('add_edge', { source: 'a', target: 'b' })
    const node = ok('update_node', { id: 'a', label: 'Alpha', shape: 'diamond', x: 10, y: 20 })
    expect(node.label).toBe('Alpha')
    expect(node.kind).toBe('diamond')
    expect(node.x).toBe(10)
    const updated = ok('update_edge', { id: edge.id, label: 'flows', type: 'straight' })
    expect(updated.label).toBe('flows')
  })

  it('groups, ungroups and deletes', () => {
    ok('add_node', { label: 'A', x: 0, y: 0 })
    ok('add_node', { label: 'B', x: 300, y: 0 })
    const group = ok('group_nodes', { node_ids: ['a', 'b'], label: 'Pair' })
    expect(ok('get_node', { id: group.id }).children.sort()).toEqual(['a', 'b'])
    ok('ungroup', { group_id: group.id })
    expect(useDiagramStore.getState().nodes).toHaveLength(2)
    ok('delete_node', { id: 'a' })
    expect(useDiagramStore.getState().nodes.map((n) => n.id)).toEqual(['b'])
  })

  it('auto_layout and clear_diagram operate on the store', () => {
    ok('add_node', { label: 'One' })
    ok('add_node', { label: 'Two' })
    ok('add_edge', { source: 'one', target: 'two' })
    ok('auto_layout', { direction: 'TB' })
    const [one, two] = useDiagramStore.getState().nodes
    expect(one!.position.y).toBeLessThan(two!.position.y)
    ok('clear_diagram')
    expect(useDiagramStore.getState().nodes).toHaveLength(0)
  })
})

describe('read tools', () => {
  it('find matches labels, ids and descriptions case-insensitively', () => {
    ok('add_node', { label: 'Payment Service', description: 'handles Stripe webhooks' })
    ok('add_node', { label: 'Mailer' })
    expect(ok('find', { query: 'payment' }).nodes).toHaveLength(1)
    expect(ok('find', { query: 'STRIPE' }).nodes).toHaveLength(1)
    expect(ok('find', { query: 'zebra' }).nodes).toHaveLength(0)
  })

  it('get_node reports connected edges', () => {
    ok('add_node', { label: 'A' })
    ok('add_node', { label: 'B' })
    ok('add_edge', { source: 'a', target: 'b' })
    expect(ok('get_node', { id: 'a' }).edges).toHaveLength(1)
  })
})

describe('validation and errors', () => {
  it('returns structured errors instead of throwing', () => {
    const missing = executeTool('add_node', {})
    expect(missing).toEqual({ ok: false, error: expect.stringContaining('label is required') })

    const badEnum = executeTool('add_node', { label: 'X', shape: 'dodecahedron' })
    expect(badEnum.ok).toBe(false)

    const unknownTool = executeTool('teleport', {})
    expect(unknownTool).toEqual({ ok: false, error: 'unknown tool "teleport"' })

    const badTarget = executeTool('add_edge', { source: 'nope', target: 'nada' })
    expect(badTarget.ok).toBe(false)
  })

  it('strips undeclared argument keys', () => {
    const result = ok('add_node', { label: 'Clean', bogus: 'ignored' })
    expect(result.id).toBe('clean')
  })

  it('executeToolFromJson handles malformed and empty JSON', () => {
    expect(executeToolFromJson('describe_diagram', '').ok).toBe(true)
    expect(executeToolFromJson('add_node', '{"label": "Ok"}').ok).toBe(true)
    const bad = executeToolFromJson('add_node', '{oops')
    expect(bad).toEqual({ ok: false, error: expect.stringContaining('not valid JSON') })
  })

  it('notifies tool call listeners for successes and failures', () => {
    const listener = vi.fn()
    const unsubscribe = onToolCall(listener)
    executeTool('add_node', { label: 'Seen' })
    executeTool('add_node', {})
    unsubscribe()
    executeTool('add_node', { label: 'Unseen' })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener.mock.calls[0]![0].result.ok).toBe(true)
    expect(listener.mock.calls[1]![0].result.ok).toBe(false)
  })
})

describe('layout and styling tools', () => {
  it('align_nodes and distribute_nodes report new positions', () => {
    ok('add_node', { label: 'A', x: 0, y: 0, width: 100 })
    ok('add_node', { label: 'B', x: 300, y: 80, width: 100 })
    ok('add_node', { label: 'C', x: 600, y: 40, width: 100 })
    const aligned = ok('align_nodes', { node_ids: ['a', 'b', 'c'], alignment: 'top' })
    expect(aligned.every((n: { y: number }) => n.y === 0)).toBe(true)
    const spread = ok('distribute_nodes', { node_ids: ['a', 'b', 'c'], axis: 'horizontal', spacing: 50 })
    expect(spread.map((n: { x: number }) => n.x)).toEqual([0, 150, 300])
  })

  it('auto_layout accepts a container scope', () => {
    ok('add_group', { label: 'Zone', x: 500, y: 500 })
    ok('add_node', { label: 'A', parent_id: 'zone', x: 1, y: 1 })
    ok('add_node', { label: 'B', parent_id: 'zone', x: 1, y: 1 })
    ok('add_edge', { source: 'a', target: 'b' })
    const result = ok('auto_layout', { direction: 'TB', container_id: 'zone' })
    expect(result.scope).toBe('zone')
    const zone = useDiagramStore.getState().nodes.find((n) => n.id === 'zone')!
    expect(zone.position).toEqual({ x: 500, y: 500 })
  })

  it('new shapes and font_size flow through add_node', () => {
    const title = ok('add_node', { label: 'My System', shape: 'text', font_size: 22 })
    ok('add_node', { label: 'DB', shape: 'cylinder' })
    ok('add_node', { label: 'IO', shape: 'parallelogram' })
    const node = useDiagramStore.getState().nodes.find((n) => n.id === title.id)!
    expect(node.data).toMatchObject({ shape: 'text', fontSize: 22 })
    expect(ok('get_node', { id: 'db' }).kind).toBe('cylinder')
  })
})

describe('openai tool export', () => {
  it('exposes every registry tool as a flat function tool', () => {
    const tools = toOpenAITools()
    expect(tools.map((t) => t.name).sort()).toEqual(diagramTools.map((t) => t.name).sort())
    for (const tool of tools) {
      expect(tool.type).toBe('function')
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.parameters.type).toBe('object')
    }
  })
})
