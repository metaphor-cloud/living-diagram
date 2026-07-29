import type { Edge, Node } from '@xyflow/react'

export const SHAPES = [
  'rectangle',
  'rounded',
  'ellipse',
  'diamond',
  'cylinder',
  'hexagon',
  'parallelogram',
  'note',
  'text',
] as const
export type Shape = (typeof SHAPES)[number]

export type ShapeNodeData = {
  label: string
  shape: Shape
  description?: string
  /** Background / fill color (any CSS color). */
  color?: string
  textColor?: string
  borderColor?: string
  /** Optional emoji rendered before the label. */
  icon?: string
  /** Label font size in px (default 13). */
  fontSize?: number
}

export type GroupNodeData = {
  label: string
  /** Tint color for the group background and border. */
  color?: string
}

export type ShapeNode = Node<ShapeNodeData, 'shape'>
export type GroupNode = Node<GroupNodeData, 'group'>
export type DiagramNode = ShapeNode | GroupNode

export function isGroupNode(node: DiagramNode): node is GroupNode {
  return node.type === 'group'
}

/**
 * Edge path types exposed to users/AI. "bezier" maps to React Flow's
 * built-in "default" edge type.
 */
export const EDGE_PATH_TYPES = ['bezier', 'smoothstep', 'step', 'straight'] as const
export type EdgePathType = (typeof EDGE_PATH_TYPES)[number]

export const ARROW_STYLES = ['none', 'arrow', 'arrowclosed'] as const
export type ArrowStyle = (typeof ARROW_STYLES)[number]

export type DiagramEdge = Edge

export const HANDLE_IDS = ['top', 'right', 'bottom', 'left'] as const
export type HandleId = (typeof HANDLE_IDS)[number]

export const DEFAULT_SHAPE_WIDTH = 180
export const DEFAULT_SHAPE_HEIGHT = 64
export const DEFAULT_GROUP_WIDTH = 320
export const DEFAULT_GROUP_HEIGHT = 220

export function nodeSize(node: DiagramNode): { width: number; height: number } {
  const isGroup = isGroupNode(node)
  return {
    width:
      node.width ?? node.measured?.width ?? (isGroup ? DEFAULT_GROUP_WIDTH : DEFAULT_SHAPE_WIDTH),
    height:
      node.height ??
      node.measured?.height ??
      (isGroup ? DEFAULT_GROUP_HEIGHT : DEFAULT_SHAPE_HEIGHT),
  }
}
