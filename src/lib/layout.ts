import dagre from '@dagrejs/dagre'
import type { DiagramEdge, DiagramNode } from '../types/diagram'
import { isGroupNode, nodeSize } from '../types/diagram'

export const LAYOUT_DIRECTIONS = ['LR', 'TB', 'RL', 'BT'] as const
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number]

const GROUP_PADDING = 24
const GROUP_LABEL_SPACE = 32
const ROOT_OFFSET = 40

type Box = { width: number; height: number }

/**
 * Lays out the whole diagram with dagre, container by container: children of
 * each group are laid out relative to that group (post-order, deepest first),
 * groups are resized to fit their laid-out children, then the parent level is
 * laid out using those sizes. Edges crossing container boundaries do not
 * participate in ranking. Returns a new node array; never mutates inputs.
 */
export function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection = 'LR',
  /** Group id to lay out in isolation (its interior only); '' = whole diagram. */
  scopeId = '',
): DiagramNode[] {
  const childrenOf = new Map<string, DiagramNode[]>()
  for (const node of nodes) {
    const key = node.parentId ?? ''
    const siblings = childrenOf.get(key)
    if (siblings) siblings.push(node)
    else childrenOf.set(key, [node])
  }

  const groupSizes = new Map<string, Box>()
  const positions = new Map<string, { x: number; y: number }>()

  const layoutContainer = (containerId: string): Box => {
    const children = childrenOf.get(containerId) ?? []
    // Post-order: size nested groups before laying out this level.
    for (const child of children) {
      if (isGroupNode(child)) layoutContainer(child.id)
    }

    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: direction, nodesep: 48, ranksep: 72 })
    g.setDefaultEdgeLabel(() => ({}))

    const memberIds = new Set(children.map((c) => c.id))
    for (const child of children) {
      const size = isGroupNode(child) ? (groupSizes.get(child.id) ?? nodeSize(child)) : nodeSize(child)
      g.setNode(child.id, { width: size.width, height: size.height })
    }
    for (const edge of edges) {
      if (memberIds.has(edge.source) && memberIds.has(edge.target) && edge.source !== edge.target) {
        g.setEdge(edge.source, edge.target)
      }
    }

    dagre.layout(g)

    const isRoot = containerId === ''
    const offsetX = isRoot ? ROOT_OFFSET : GROUP_PADDING
    const offsetY = isRoot ? ROOT_OFFSET : GROUP_LABEL_SPACE
    let maxX = 0
    let maxY = 0
    for (const child of children) {
      const placed = g.node(child.id)
      // dagre returns center coordinates; React Flow positions are top-left.
      const x = placed.x - placed.width / 2 + offsetX
      const y = placed.y - placed.height / 2 + offsetY
      positions.set(child.id, { x, y })
      maxX = Math.max(maxX, x + placed.width)
      maxY = Math.max(maxY, y + placed.height)
    }

    const box: Box = {
      width: Math.max(maxX + GROUP_PADDING, 120),
      height: Math.max(maxY + GROUP_PADDING, 80),
    }
    if (!isRoot) groupSizes.set(containerId, box)
    return box
  }

  layoutContainer(scopeId)

  return nodes.map((node) => {
    const position = positions.get(node.id) ?? node.position
    if (isGroupNode(node)) {
      const size = groupSizes.get(node.id)
      if (size) return { ...node, position, width: size.width, height: size.height }
    }
    return { ...node, position }
  })
}
