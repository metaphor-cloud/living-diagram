import { beforeEach, describe, expect, it } from 'vitest'
import { absolutePosition, DiagramError, useDiagramStore } from './diagram'
import { isGroupNode } from '../types/diagram'

const store = () => useDiagramStore.getState()

beforeEach(() => {
  useDiagramStore.setState({ nodes: [], edges: [] })
})

describe('addNode', () => {
  it('creates a readable slug id from the label', () => {
    const node = store().addNode({ label: 'API Server' })
    expect(node.id).toBe('api-server')
    expect(node.data.shape).toBe('rounded')
  })

  it('dedupes colliding ids with numeric suffixes', () => {
    store().addNode({ label: 'Cache' })
    const second = store().addNode({ label: 'Cache' })
    const third = store().addNode({ label: 'cache!' })
    expect(second.id).toBe('cache-2')
    expect(third.id).toBe('cache-3')
  })

  it('auto-places siblings without overlapping positions', () => {
    const a = store().addNode({ label: 'A' })
    const b = store().addNode({ label: 'B' })
    expect(a.position).not.toEqual(b.position)
  })

  it('applies styling and size', () => {
    const node = store().addNode({
      label: 'DB',
      shape: 'ellipse',
      color: '#dbeafe',
      borderColor: '#1d4ed8',
      width: 220,
      height: 90,
      icon: '🗄️',
    })
    expect(node.data.color).toBe('#dbeafe')
    expect(node.width).toBe(220)
    expect(node.data.icon).toBe('🗄️')
  })

  it('rejects a parentId that is not a group', () => {
    store().addNode({ label: 'Plain' })
    expect(() => store().addNode({ label: 'Child', parentId: 'plain' })).toThrow(DiagramError)
  })
})

describe('updateNode', () => {
  it('patches data fields without clobbering others', () => {
    store().addNode({ label: 'Web', color: '#fff' })
    const updated = store().updateNode('web', { label: 'Web Tier', shape: 'diamond' })
    if (isGroupNode(updated)) throw new Error('expected shape node')
    expect(updated.data.label).toBe('Web Tier')
    expect(updated.data.shape).toBe('diamond')
    expect(updated.data.color).toBe('#fff')
  })

  it('moves a node into and out of a group', () => {
    store().addGroup({ label: 'Zone' })
    store().addNode({ label: 'Svc' })
    const inGroup = store().updateNode('svc', { parentId: 'zone' })
    expect(inGroup.parentId).toBe('zone')
    const outAgain = store().updateNode('svc', { parentId: null })
    expect(outAgain.parentId).toBeUndefined()
  })

  it('refuses to nest a group inside its own descendant', () => {
    store().addGroup({ label: 'Outer' })
    store().addGroup({ label: 'Inner', parentId: 'outer' })
    expect(() => store().updateNode('outer', { parentId: 'inner' })).toThrow(DiagramError)
  })

  it('throws for unknown ids', () => {
    expect(() => store().updateNode('nope', { label: 'x' })).toThrow(DiagramError)
  })
})

describe('deleteNode', () => {
  it('removes the node and its connected edges', () => {
    store().addNode({ label: 'A' })
    store().addNode({ label: 'B' })
    store().addEdge({ source: 'a', target: 'b' })
    const result = store().deleteNode('a')
    expect(result.removedNodeIds).toEqual(['a'])
    expect(result.removedEdgeIds).toHaveLength(1)
    expect(store().nodes.map((n) => n.id)).toEqual(['b'])
    expect(store().edges).toHaveLength(0)
  })

  it('removes group descendants recursively', () => {
    store().addGroup({ label: 'G' })
    store().addGroup({ label: 'Inner', parentId: 'g' })
    store().addNode({ label: 'Leaf', parentId: 'inner' })
    store().addNode({ label: 'Outside' })
    const result = store().deleteNode('g')
    expect(result.removedNodeIds.sort()).toEqual(['g', 'inner', 'leaf'])
    expect(store().nodes.map((n) => n.id)).toEqual(['outside'])
  })
})

describe('edges', () => {
  beforeEach(() => {
    store().addNode({ label: 'A' })
    store().addNode({ label: 'B' })
  })

  it('creates an edge with defaults: smoothstep + closed arrow', () => {
    const edge = store().addEdge({ source: 'a', target: 'b' })
    expect(edge.type).toBe('smoothstep')
    expect(edge.markerEnd).toMatchObject({ type: 'arrowclosed' })
  })

  it('maps bezier to the react flow default type', () => {
    const edge = store().addEdge({ source: 'a', target: 'b', type: 'bezier' })
    expect(edge.type).toBe('default')
  })

  it('applies label, animation, color, dashing and handles', () => {
    const edge = store().addEdge({
      source: 'a',
      target: 'b',
      label: 'calls',
      animated: true,
      color: '#dc2626',
      dashed: true,
      sourceHandle: 'right',
      targetHandle: 'left',
    })
    expect(edge.label).toBe('calls')
    expect(edge.animated).toBe(true)
    expect(edge.style).toMatchObject({ stroke: '#dc2626', strokeDasharray: '7 4' })
    expect(edge.sourceHandle).toBe('right')
  })

  it('rejects edges to unknown nodes', () => {
    expect(() => store().addEdge({ source: 'a', target: 'ghost' })).toThrow(DiagramError)
  })

  it('updates an edge preserving unspecified styling', () => {
    const edge = store().addEdge({ source: 'a', target: 'b', color: '#16a34a', width: 3 })
    const updated = store().updateEdge(edge.id, { label: 'reads', type: 'straight' })
    expect(updated.label).toBe('reads')
    expect(updated.type).toBe('straight')
    expect(updated.style).toMatchObject({ stroke: '#16a34a', strokeWidth: 3 })
  })

  it('deletes edges and throws on unknown edge ids', () => {
    const edge = store().addEdge({ source: 'a', target: 'b' })
    store().deleteEdge(edge.id)
    expect(store().edges).toHaveLength(0)
    expect(() => store().deleteEdge(edge.id)).toThrow(DiagramError)
  })

  it('onConnect creates an edge from a manual connection', () => {
    store().onConnect({ source: 'a', target: 'b', sourceHandle: 'bottom', targetHandle: 'top' })
    expect(store().edges).toHaveLength(1)
    expect(store().edges[0]?.sourceHandle).toBe('bottom')
  })
})

describe('grouping', () => {
  it('wraps nodes in a group and preserves absolute positions', () => {
    const a = store().addNode({ label: 'A', position: { x: 100, y: 100 } })
    store().addNode({ label: 'B', position: { x: 400, y: 220 } })
    const group = store().groupNodes(['a', 'b'], 'Cluster', '#0ea5e9')

    const nodes = store().nodes
    const movedA = nodes.find((n) => n.id === 'a')
    expect(movedA?.parentId).toBe(group.id)
    // absolute position must be unchanged by grouping
    expect(absolutePosition(nodes, movedA!)).toEqual(absolutePosition([a], a))
    // group box must contain both members
    expect(group.position.x).toBeLessThanOrEqual(100)
    expect(group.position.y).toBeLessThanOrEqual(100)
    expect(group.width!).toBeGreaterThan(300)
  })

  it('orders the group before its children for react flow', () => {
    store().addNode({ label: 'A', position: { x: 0, y: 0 } })
    store().groupNodes(['a'], 'G')
    const ids = store().nodes.map((n) => n.id)
    expect(ids.indexOf('g')).toBeLessThan(ids.indexOf('a'))
  })

  it('refuses to group nodes with different parents', () => {
    store().addGroup({ label: 'Zone' })
    store().addNode({ label: 'In', parentId: 'zone' })
    store().addNode({ label: 'Out' })
    expect(() => store().groupNodes(['in', 'out'], 'Mixed')).toThrow(DiagramError)
  })

  it('ungroup restores absolute positions and removes the group', () => {
    store().addNode({ label: 'A', position: { x: 100, y: 100 } })
    store().groupNodes(['a'], 'G')
    const before = absolutePosition(store().nodes, store().nodes.find((n) => n.id === 'a')!)
    store().ungroup('g')
    const a = store().nodes.find((n) => n.id === 'a')!
    expect(a.parentId).toBeUndefined()
    expect(a.position).toEqual(before)
    expect(store().nodes.some((n) => n.id === 'g')).toBe(false)
  })

  it('ungroup rejects non-groups', () => {
    store().addNode({ label: 'A' })
    expect(() => store().ungroup('a')).toThrow(DiagramError)
  })
})

describe('autoLayout', () => {
  it('spreads a chain along x when direction is LR', () => {
    store().addNode({ label: 'One', position: { x: 0, y: 0 } })
    store().addNode({ label: 'Two', position: { x: 0, y: 0 } })
    store().addNode({ label: 'Three', position: { x: 0, y: 0 } })
    store().addEdge({ source: 'one', target: 'two' })
    store().addEdge({ source: 'two', target: 'three' })
    store().autoLayout('LR')
    const x = (id: string) => store().nodes.find((n) => n.id === id)!.position.x
    expect(x('one')).toBeLessThan(x('two'))
    expect(x('two')).toBeLessThan(x('three'))
  })

  it('lays out group children relative to the group and resizes it to fit', () => {
    store().addGroup({ label: 'G' })
    store().addNode({ label: 'A', parentId: 'g' })
    store().addNode({ label: 'B', parentId: 'g' })
    store().addEdge({ source: 'a', target: 'b' })
    store().autoLayout('TB')
    const nodes = store().nodes
    const group = nodes.find((n) => n.id === 'g')!
    const a = nodes.find((n) => n.id === 'a')!
    const b = nodes.find((n) => n.id === 'b')!
    expect(a.position.y).toBeLessThan(b.position.y)
    // children fit inside the resized group
    for (const child of [a, b]) {
      expect(child.position.x).toBeGreaterThanOrEqual(0)
      expect(child.position.y).toBeGreaterThanOrEqual(0)
      expect(child.position.x + 180).toBeLessThanOrEqual(group.width!)
      expect(child.position.y + 64).toBeLessThanOrEqual(group.height!)
    }
  })
})

describe('alignNodes', () => {
  it('aligns tops and left edges', () => {
    store().addNode({ label: 'A', position: { x: 10, y: 50 }, width: 100, height: 40 })
    store().addNode({ label: 'B', position: { x: 200, y: 90 }, width: 120, height: 60 })
    store().alignNodes(['a', 'b'], 'top')
    let [a, b] = store().nodes
    expect(a!.position.y).toBe(50)
    expect(b!.position.y).toBe(50)
    store().alignNodes(['a', 'b'], 'left')
    ;[a, b] = store().nodes
    expect(a!.position.x).toBe(10)
    expect(b!.position.x).toBe(10)
  })

  it('centers on the average midline accounting for sizes', () => {
    store().addNode({ label: 'A', position: { x: 0, y: 0 }, width: 100, height: 40 })
    store().addNode({ label: 'B', position: { x: 300, y: 200 }, width: 200, height: 40 })
    store().alignNodes(['a', 'b'], 'center')
    const [a, b] = store().nodes
    const centerA = a!.position.x + 50
    const centerB = b!.position.x + 100
    expect(centerA).toBeCloseTo(centerB)
  })

  it('rejects mixed parents and fewer than two nodes', () => {
    store().addGroup({ label: 'G' })
    store().addNode({ label: 'In', parentId: 'g' })
    store().addNode({ label: 'Out' })
    expect(() => store().alignNodes(['in', 'out'], 'top')).toThrow(DiagramError)
    expect(() => store().alignNodes(['out'], 'top')).toThrow(DiagramError)
  })
})

describe('distributeNodes', () => {
  it('packs with a fixed gap along x', () => {
    store().addNode({ label: 'A', position: { x: 0, y: 0 }, width: 100 })
    store().addNode({ label: 'B', position: { x: 500, y: 0 }, width: 100 })
    store().addNode({ label: 'C', position: { x: 90, y: 0 }, width: 100 })
    store().distributeNodes(['a', 'b', 'c'], 'horizontal', 20)
    const x = (id: string) => store().nodes.find((n) => n.id === id)!.position.x
    // sorted by current x: a(0), c(90), b(500) -> packed 0, 120, 240
    expect(x('a')).toBe(0)
    expect(x('c')).toBe(120)
    expect(x('b')).toBe(240)
  })

  it('spreads evenly between the outermost nodes without spacing', () => {
    store().addNode({ label: 'A', position: { x: 0, y: 0 }, width: 100 })
    store().addNode({ label: 'B', position: { x: 110, y: 0 }, width: 100 })
    store().addNode({ label: 'C', position: { x: 500, y: 0 }, width: 100 })
    store().distributeNodes(['a', 'b', 'c'], 'horizontal')
    const x = (id: string) => store().nodes.find((n) => n.id === id)!.position.x
    expect(x('a')).toBe(0)
    expect(x('c')).toBe(500) // outermost stay fixed
    expect(x('b')).toBeCloseTo(250) // gap = (600 - 300) / 2 = 150 -> 0+100+150
  })

  it('needs three nodes to spread but two with explicit spacing', () => {
    store().addNode({ label: 'A' })
    store().addNode({ label: 'B' })
    expect(() => store().distributeNodes(['a', 'b'], 'horizontal')).toThrow(DiagramError)
    expect(() => store().distributeNodes(['a', 'b'], 'horizontal', 30)).not.toThrow()
  })
})

describe('scoped autoLayout', () => {
  it('lays out only the given group interior and leaves the rest untouched', () => {
    store().addGroup({ label: 'Zone', position: { x: 600, y: 300 } })
    store().addNode({ label: 'In1', parentId: 'zone', position: { x: 5, y: 5 } })
    store().addNode({ label: 'In2', parentId: 'zone', position: { x: 5, y: 5 } })
    store().addEdge({ source: 'in1', target: 'in2' })
    store().addNode({ label: 'Outside', position: { x: 42, y: 43 } })

    store().autoLayout('LR', 'zone')

    const nodes = store().nodes
    const outside = nodes.find((n) => n.id === 'outside')!
    const zone = nodes.find((n) => n.id === 'zone')!
    const in1 = nodes.find((n) => n.id === 'in1')!
    const in2 = nodes.find((n) => n.id === 'in2')!
    expect(outside.position).toEqual({ x: 42, y: 43 })
    expect(zone.position).toEqual({ x: 600, y: 300 }) // group itself does not move
    expect(in1.position.x).toBeLessThan(in2.position.x) // interior laid out LR
    expect(in1.position).not.toEqual(in2.position)
  })

  it('rejects a scope that is not a group', () => {
    store().addNode({ label: 'A' })
    expect(() => store().autoLayout('LR', 'a')).toThrow(DiagramError)
  })
})

describe('clear and replaceAll', () => {
  it('clear empties the diagram', () => {
    store().addNode({ label: 'A' })
    store().clear()
    expect(store().nodes).toHaveLength(0)
    expect(store().edges).toHaveLength(0)
  })

  it('replaceAll sorts parents before children', () => {
    store().addGroup({ label: 'G' })
    store().addNode({ label: 'A', parentId: 'g' })
    const { nodes, edges } = store()
    const reversed = [...nodes].reverse()
    store().clear()
    store().replaceAll(reversed, edges)
    const ids = store().nodes.map((n) => n.id)
    expect(ids.indexOf('g')).toBeLessThan(ids.indexOf('a'))
  })
})
