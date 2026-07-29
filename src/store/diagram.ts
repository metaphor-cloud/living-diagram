import {
  MarkerType,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import { uniqueId } from '../lib/id'
import { layoutDiagram, type LayoutDirection } from '../lib/layout'
import type {
  ArrowStyle,
  DiagramEdge,
  DiagramNode,
  EdgePathType,
  GroupNode,
  HandleId,
  Shape,
  ShapeNode,
} from '../types/diagram'
import { isGroupNode, nodeSize } from '../types/diagram'

export type AddNodeSpec = {
  label: string
  shape?: Shape
  parentId?: string
  position?: { x: number; y: number }
  width?: number
  height?: number
  color?: string
  textColor?: string
  borderColor?: string
  description?: string
  icon?: string
  fontSize?: number
}

export const ALIGNMENTS = ['left', 'center', 'right', 'top', 'middle', 'bottom'] as const
export type Alignment = (typeof ALIGNMENTS)[number]

export const DISTRIBUTE_AXES = ['horizontal', 'vertical'] as const
export type DistributeAxis = (typeof DISTRIBUTE_AXES)[number]

export type UpdateNodeSpec = Partial<Omit<AddNodeSpec, 'parentId'>> & {
  /** New parent group id, or null to detach from the current parent. */
  parentId?: string | null
}

export type AddGroupSpec = {
  label: string
  parentId?: string
  position?: { x: number; y: number }
  width?: number
  height?: number
  color?: string
}

export type AddEdgeSpec = {
  source: string
  target: string
  sourceHandle?: HandleId
  targetHandle?: HandleId
  label?: string
  type?: EdgePathType
  animated?: boolean
  color?: string
  width?: number
  dashed?: boolean
  markerStart?: ArrowStyle
  markerEnd?: ArrowStyle
}

export type UpdateEdgeSpec = Partial<AddEdgeSpec>

export class DiagramError extends Error {}

type DiagramState = {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  onNodesChange: (changes: NodeChange<DiagramNode>[]) => void
  onEdgesChange: (changes: EdgeChange<DiagramEdge>[]) => void
  onConnect: (connection: Connection) => void
  addNode: (spec: AddNodeSpec) => ShapeNode
  addGroup: (spec: AddGroupSpec) => GroupNode
  updateNode: (id: string, spec: UpdateNodeSpec) => DiagramNode
  deleteNode: (id: string) => { removedNodeIds: string[]; removedEdgeIds: string[] }
  addEdge: (spec: AddEdgeSpec) => DiagramEdge
  updateEdge: (id: string, spec: UpdateEdgeSpec) => DiagramEdge
  deleteEdge: (id: string) => void
  groupNodes: (nodeIds: string[], label: string, color?: string) => GroupNode
  ungroup: (groupId: string) => void
  alignNodes: (nodeIds: string[], alignment: Alignment) => DiagramNode[]
  distributeNodes: (nodeIds: string[], axis: DistributeAxis, spacing?: number) => DiagramNode[]
  autoLayout: (direction?: LayoutDirection, scopeId?: string) => void
  clear: () => void
  replaceAll: (nodes: DiagramNode[], edges: DiagramEdge[]) => void
}

const EDGE_TYPE_MAP: Record<EdgePathType, string> = {
  bezier: 'default',
  smoothstep: 'smoothstep',
  step: 'step',
  straight: 'straight',
}

function requireNode(nodes: DiagramNode[], id: string): DiagramNode {
  const node = nodes.find((n) => n.id === id)
  if (!node) throw new DiagramError(`no node with id "${id}"`)
  return node
}

function requireGroup(nodes: DiagramNode[], id: string): GroupNode {
  const node = requireNode(nodes, id)
  if (!isGroupNode(node)) throw new DiagramError(`node "${id}" is not a group`)
  return node
}

/** Absolute canvas position of a node, walking up its parent chain. */
export function absolutePosition(
  nodes: DiagramNode[],
  node: DiagramNode,
): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  while (parentId) {
    const parent = nodes.find((n) => n.id === parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

function autoPlace(nodes: DiagramNode[], parentId: string | undefined): { x: number; y: number } {
  const siblings = nodes.filter((n) => (n.parentId ?? undefined) === parentId && !isGroupNode(n))
  const index = siblings.length
  const base = parentId ? 32 : 40
  return { x: base + (index % 4) * 220, y: base + Math.floor(index / 4) * 120 }
}

function marker(style: ArrowStyle | undefined, color: string | undefined) {
  if (!style || style === 'none') return undefined
  return {
    type: style === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed,
    color,
    width: 18,
    height: 18,
  }
}

function edgeStyle(spec: { color?: string; width?: number; dashed?: boolean }) {
  return {
    stroke: spec.color,
    strokeWidth: spec.width ?? 2,
    strokeDasharray: spec.dashed ? '7 4' : undefined,
  }
}

/** Descendant node ids of `id` (not including `id` itself). */
function descendantIds(nodes: DiagramNode[], id: string): string[] {
  const out: string[] = []
  const walk = (parentId: string) => {
    for (const node of nodes) {
      if (node.parentId === parentId) {
        out.push(node.id)
        walk(node.id)
      }
    }
  }
  walk(id)
  return out
}

function assertNoParentCycle(nodes: DiagramNode[], id: string, parentId: string) {
  if (parentId === id || descendantIds(nodes, id).includes(parentId)) {
    throw new DiagramError(`cannot nest "${id}" inside its own descendant "${parentId}"`)
  }
}

/** Groups must come before their children in React Flow's node array. */
function sortParentsFirst(nodes: DiagramNode[]): DiagramNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depth = (node: DiagramNode): number => {
    let d = 0
    let parentId = node.parentId
    while (parentId) {
      d++
      parentId = byId.get(parentId)?.parentId
    }
    return d
  }
  return [...nodes].sort((a, b) => depth(a) - depth(b))
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  nodes: [],
  edges: [],

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) => {
    const { source, target, sourceHandle, targetHandle } = connection
    if (!source || !target) return
    get().addEdge({
      source,
      target,
      sourceHandle: (sourceHandle as HandleId | null) ?? undefined,
      targetHandle: (targetHandle as HandleId | null) ?? undefined,
    })
  },

  addNode: (spec) => {
    const { nodes } = get()
    if (spec.parentId) requireGroup(nodes, spec.parentId)
    const node: ShapeNode = {
      id: uniqueId(
        spec.label,
        nodes.map((n) => n.id),
      ),
      type: 'shape',
      position: spec.position ?? autoPlace(nodes, spec.parentId),
      parentId: spec.parentId,
      width: spec.width,
      height: spec.height,
      data: {
        label: spec.label,
        shape: spec.shape ?? 'rounded',
        color: spec.color,
        textColor: spec.textColor,
        borderColor: spec.borderColor,
        description: spec.description,
        icon: spec.icon,
        fontSize: spec.fontSize,
      },
    }
    set({ nodes: sortParentsFirst([...nodes, node]) })
    return node
  },

  addGroup: (spec) => {
    const { nodes } = get()
    if (spec.parentId) requireGroup(nodes, spec.parentId)
    const group: GroupNode = {
      id: uniqueId(
        spec.label,
        nodes.map((n) => n.id),
      ),
      type: 'group',
      position: spec.position ?? autoPlace(nodes, spec.parentId),
      parentId: spec.parentId,
      width: spec.width ?? 320,
      height: spec.height ?? 220,
      data: { label: spec.label, color: spec.color },
    }
    set({ nodes: sortParentsFirst([...nodes, group]) })
    return group
  },

  updateNode: (id, spec) => {
    const { nodes } = get()
    const node = requireNode(nodes, id)

    let parentId = node.parentId
    if (spec.parentId !== undefined) {
      if (spec.parentId === null) {
        parentId = undefined
      } else {
        requireGroup(nodes, spec.parentId)
        assertNoParentCycle(nodes, id, spec.parentId)
        parentId = spec.parentId
      }
    }

    const updated: DiagramNode = isGroupNode(node)
      ? {
          ...node,
          parentId,
          position: spec.position ?? node.position,
          width: spec.width ?? node.width,
          height: spec.height ?? node.height,
          data: {
            ...node.data,
            label: spec.label ?? node.data.label,
            color: spec.color ?? node.data.color,
          },
        }
      : {
          ...node,
          parentId,
          position: spec.position ?? node.position,
          width: spec.width ?? node.width,
          height: spec.height ?? node.height,
          data: {
            ...node.data,
            label: spec.label ?? node.data.label,
            shape: spec.shape ?? node.data.shape,
            color: spec.color ?? node.data.color,
            textColor: spec.textColor ?? node.data.textColor,
            borderColor: spec.borderColor ?? node.data.borderColor,
            description: spec.description ?? node.data.description,
            icon: spec.icon ?? node.data.icon,
            fontSize: spec.fontSize ?? node.data.fontSize,
          },
        }

    set({
      nodes: sortParentsFirst(nodes.map((n) => (n.id === id ? updated : n))),
    })
    return updated
  },

  deleteNode: (id) => {
    const { nodes, edges } = get()
    requireNode(nodes, id)
    const removedNodeIds = [id, ...descendantIds(nodes, id)]
    const removedSet = new Set(removedNodeIds)
    const removedEdges = edges.filter((e) => removedSet.has(e.source) || removedSet.has(e.target))
    set({
      nodes: nodes.filter((n) => !removedSet.has(n.id)),
      edges: edges.filter((e) => !removedSet.has(e.source) && !removedSet.has(e.target)),
    })
    return { removedNodeIds, removedEdgeIds: removedEdges.map((e) => e.id) }
  },

  addEdge: (spec) => {
    const { nodes, edges } = get()
    requireNode(nodes, spec.source)
    requireNode(nodes, spec.target)
    const edge: DiagramEdge = {
      id: uniqueId(
        `${spec.source}-${spec.target}`,
        edges.map((e) => e.id),
      ),
      source: spec.source,
      target: spec.target,
      sourceHandle: spec.sourceHandle,
      targetHandle: spec.targetHandle,
      label: spec.label,
      type: EDGE_TYPE_MAP[spec.type ?? 'smoothstep'],
      animated: spec.animated,
      style: edgeStyle(spec),
      markerStart: marker(spec.markerStart, spec.color),
      markerEnd: marker(spec.markerEnd ?? 'arrowclosed', spec.color),
    }
    set({ edges: [...edges, edge] })
    return edge
  },

  updateEdge: (id, spec) => {
    const { nodes, edges } = get()
    const edge = edges.find((e) => e.id === id)
    if (!edge) throw new DiagramError(`no edge with id "${id}"`)
    if (spec.source) requireNode(nodes, spec.source)
    if (spec.target) requireNode(nodes, spec.target)

    const previous = edge.style ?? {}
    const color = spec.color ?? (typeof previous.stroke === 'string' ? previous.stroke : undefined)
    const width =
      spec.width ?? (typeof previous.strokeWidth === 'number' ? previous.strokeWidth : undefined)
    const dashed = spec.dashed ?? Boolean(previous.strokeDasharray)

    const updated: DiagramEdge = {
      ...edge,
      source: spec.source ?? edge.source,
      target: spec.target ?? edge.target,
      sourceHandle: spec.sourceHandle ?? edge.sourceHandle,
      targetHandle: spec.targetHandle ?? edge.targetHandle,
      label: spec.label ?? edge.label,
      type: spec.type ? EDGE_TYPE_MAP[spec.type] : edge.type,
      animated: spec.animated ?? edge.animated,
      style: edgeStyle({ color, width, dashed }),
      markerStart: spec.markerStart ? marker(spec.markerStart, color) : edge.markerStart,
      markerEnd: spec.markerEnd ? marker(spec.markerEnd, color) : edge.markerEnd,
    }
    set({ edges: edges.map((e) => (e.id === id ? updated : e)) })
    return updated
  },

  deleteEdge: (id) => {
    const { edges } = get()
    if (!edges.some((e) => e.id === id)) throw new DiagramError(`no edge with id "${id}"`)
    set({ edges: edges.filter((e) => e.id !== id) })
  },

  groupNodes: (nodeIds, label, color) => {
    const { nodes } = get()
    if (nodeIds.length === 0) throw new DiagramError('group_nodes needs at least one node id')
    const members = nodeIds.map((id) => requireNode(nodes, id))
    const parentIds = new Set(members.map((m) => m.parentId ?? undefined))
    if (parentIds.size > 1) {
      throw new DiagramError('all grouped nodes must currently share the same parent')
    }
    const sharedParent = [...parentIds][0]

    const PAD = 32
    const LABEL_SPACE = 40
    const boxes = members.map((m) => ({ pos: absolutePosition(nodes, m), size: nodeSize(m) }))
    const minX = Math.min(...boxes.map((b) => b.pos.x)) - PAD
    const minY = Math.min(...boxes.map((b) => b.pos.y)) - LABEL_SPACE
    const maxX = Math.max(...boxes.map((b) => b.pos.x + b.size.width)) + PAD
    const maxY = Math.max(...boxes.map((b) => b.pos.y + b.size.height)) + PAD

    const parentOffset = sharedParent
      ? absolutePosition(nodes, requireNode(nodes, sharedParent))
      : { x: 0, y: 0 }

    const group: GroupNode = {
      id: uniqueId(
        label,
        nodes.map((n) => n.id),
      ),
      type: 'group',
      position: { x: minX - parentOffset.x, y: minY - parentOffset.y },
      parentId: sharedParent,
      width: maxX - minX,
      height: maxY - minY,
      data: { label, color },
    }

    const memberSet = new Set(nodeIds)
    set({
      nodes: sortParentsFirst([
        ...nodes.map((n) => {
          if (!memberSet.has(n.id)) return n
          const abs = absolutePosition(nodes, n)
          return { ...n, parentId: group.id, position: { x: abs.x - minX, y: abs.y - minY } }
        }),
        group,
      ]),
    })
    return group
  },

  ungroup: (groupId) => {
    const { nodes } = get()
    const group = requireGroup(nodes, groupId)
    const groupAbs = absolutePosition(nodes, group)
    const parentAbs = group.parentId
      ? absolutePosition(nodes, requireNode(nodes, group.parentId))
      : { x: 0, y: 0 }

    set({
      nodes: sortParentsFirst(
        nodes
          .filter((n) => n.id !== groupId)
          .map((n) =>
            n.parentId === groupId
              ? {
                  ...n,
                  parentId: group.parentId,
                  position: {
                    x: groupAbs.x + n.position.x - parentAbs.x,
                    y: groupAbs.y + n.position.y - parentAbs.y,
                  },
                }
              : n,
          ),
      ),
    })
  },

  alignNodes: (nodeIds, alignment) => {
    const { nodes } = get()
    if (nodeIds.length < 2) throw new DiagramError('align_nodes needs at least two node ids')
    const members = nodeIds.map((id) => requireNode(nodes, id))
    if (new Set(members.map((m) => m.parentId ?? undefined)).size > 1) {
      throw new DiagramError('all aligned nodes must currently share the same parent')
    }
    const boxes = members.map((m) => ({ node: m, size: nodeSize(m) }))
    const lefts = boxes.map((b) => b.node.position.x)
    const rights = boxes.map((b) => b.node.position.x + b.size.width)
    const tops = boxes.map((b) => b.node.position.y)
    const bottoms = boxes.map((b) => b.node.position.y + b.size.height)
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

    const targetX = (b: (typeof boxes)[number]): number => {
      switch (alignment) {
        case 'left':
          return Math.min(...lefts)
        case 'right':
          return Math.max(...rights) - b.size.width
        case 'center':
          return avg(boxes.map((x) => x.node.position.x + x.size.width / 2)) - b.size.width / 2
        default:
          return b.node.position.x
      }
    }
    const targetY = (b: (typeof boxes)[number]): number => {
      switch (alignment) {
        case 'top':
          return Math.min(...tops)
        case 'bottom':
          return Math.max(...bottoms) - b.size.height
        case 'middle':
          return avg(boxes.map((x) => x.node.position.y + x.size.height / 2)) - b.size.height / 2
        default:
          return b.node.position.y
      }
    }

    const moved = new Map(
      boxes.map((b) => [b.node.id, { x: targetX(b), y: targetY(b) }] as const),
    )
    const updated = nodes.map((n) => {
      const position = moved.get(n.id)
      return position ? { ...n, position } : n
    })
    set({ nodes: updated })
    return updated.filter((n) => moved.has(n.id))
  },

  distributeNodes: (nodeIds, axis, spacing) => {
    const { nodes } = get()
    const minimum = spacing === undefined ? 3 : 2
    if (nodeIds.length < minimum) {
      throw new DiagramError(
        `distribute_nodes needs at least ${minimum} node ids${spacing === undefined ? ' (or 2 with an explicit spacing)' : ''}`,
      )
    }
    const members = nodeIds.map((id) => requireNode(nodes, id))
    if (new Set(members.map((m) => m.parentId ?? undefined)).size > 1) {
      throw new DiagramError('all distributed nodes must currently share the same parent')
    }
    const horizontal = axis === 'horizontal'
    const boxes = members
      .map((m) => ({ node: m, size: nodeSize(m) }))
      .sort((a, b) =>
        horizontal ? a.node.position.x - b.node.position.x : a.node.position.y - b.node.position.y,
      )

    const moved = new Map<string, { x: number; y: number }>()
    const first = boxes[0]!
    if (spacing !== undefined) {
      let cursor = horizontal ? first.node.position.x : first.node.position.y
      for (const b of boxes) {
        moved.set(b.node.id, {
          x: horizontal ? cursor : b.node.position.x,
          y: horizontal ? b.node.position.y : cursor,
        })
        cursor += (horizontal ? b.size.width : b.size.height) + spacing
      }
    } else {
      const last = boxes[boxes.length - 1]!
      const start = horizontal ? first.node.position.x : first.node.position.y
      const end = horizontal
        ? last.node.position.x + last.size.width
        : last.node.position.y + last.size.height
      const total = boxes.reduce((a, b) => a + (horizontal ? b.size.width : b.size.height), 0)
      const gap = (end - start - total) / (boxes.length - 1)
      let cursor = start
      for (const b of boxes) {
        moved.set(b.node.id, {
          x: horizontal ? cursor : b.node.position.x,
          y: horizontal ? b.node.position.y : cursor,
        })
        cursor += (horizontal ? b.size.width : b.size.height) + gap
      }
    }

    const updated = nodes.map((n) => {
      const position = moved.get(n.id)
      return position ? { ...n, position } : n
    })
    set({ nodes: updated })
    return updated.filter((n) => moved.has(n.id))
  },

  autoLayout: (direction = 'LR', scopeId) => {
    const { nodes, edges } = get()
    if (scopeId) requireGroup(nodes, scopeId)
    set({ nodes: layoutDiagram(nodes, edges, direction, scopeId ?? '') })
  },

  clear: () => set({ nodes: [], edges: [] }),

  replaceAll: (nodes, edges) => set({ nodes: sortParentsFirst(nodes), edges }),
}))
