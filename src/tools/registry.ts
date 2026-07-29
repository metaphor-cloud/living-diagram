import { LAYOUT_DIRECTIONS, type LayoutDirection } from '../lib/layout'
import {
  ALIGNMENTS,
  DISTRIBUTE_AXES,
  absolutePosition,
  DiagramError,
  useDiagramStore,
  type Alignment,
  type DistributeAxis,
} from '../store/diagram'
import {
  ARROW_STYLES,
  EDGE_PATH_TYPES,
  HANDLE_IDS,
  SHAPES,
  isGroupNode,
  nodeSize,
  type ArrowStyle,
  type DiagramNode,
  type EdgePathType,
  type HandleId,
  type Shape,
} from '../types/diagram'
import { SchemaError, validateArgs, type JsonSchema } from './schema'

/**
 * MCP-shaped tool definitions over the diagram store. Both AI surfaces
 * (Realtime voice and the text chat) consume this same registry, so read
 * and write capabilities never diverge between them.
 */
export type ToolDef = {
  name: string
  description: string
  parameters: JsonSchema
  execute: (args: Record<string, unknown>) => unknown
}

export type ToolResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string }

export type ToolCallEvent = {
  tool: string
  args: Record<string, unknown>
  result: ToolResult
}

type ToolCallListener = (event: ToolCallEvent) => void
const listeners = new Set<ToolCallListener>()

/** Subscribe to every tool execution (drives the UI activity feed). */
export function onToolCall(listener: ToolCallListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const store = () => useDiagramStore.getState()

const COLOR_HINT = 'Any CSS color, e.g. "#dbeafe" or "tomato".'

const nodeStyleProperties: Record<string, JsonSchema> = {
  color: { type: 'string', description: `Background fill. ${COLOR_HINT}` },
  text_color: { type: 'string', description: `Label color. ${COLOR_HINT}` },
  border_color: { type: 'string', description: `Border color. ${COLOR_HINT}` },
  icon: { type: 'string', description: 'Optional emoji shown before the label, e.g. "🗄️".' },
  description: { type: 'string', description: 'Longer free-text note attached to the node.' },
  font_size: { type: 'number', description: 'Label font size in px (default 13). Use ~18-24 for titles.' },
  x: { type: 'number', description: 'X position (canvas px, relative to parent group if any).' },
  y: { type: 'number', description: 'Y position.' },
  width: { type: 'number', description: 'Explicit width in px.' },
  height: { type: 'number', description: 'Explicit height in px.' },
}

const edgeStyleProperties: Record<string, JsonSchema> = {
  label: { type: 'string', description: 'Text shown on the edge.' },
  type: {
    type: 'string',
    enum: [...EDGE_PATH_TYPES],
    description: 'Path style. Default "smoothstep".',
  },
  animated: { type: 'boolean', description: 'Animate the edge (marching dashes).' },
  color: { type: 'string', description: `Stroke color. ${COLOR_HINT}` },
  width: { type: 'number', description: 'Stroke width in px (default 2).' },
  dashed: { type: 'boolean', description: 'Dashed stroke.' },
  marker_start: {
    type: 'string',
    enum: [...ARROW_STYLES],
    description: 'Arrow at the source end. Default "none".',
  },
  marker_end: {
    type: 'string',
    enum: [...ARROW_STYLES],
    description: 'Arrow at the target end. Default "arrowclosed".',
  },
  source_handle: {
    type: 'string',
    enum: [...HANDLE_IDS],
    description: 'Which side of the source node to attach to (optional).',
  },
  target_handle: {
    type: 'string',
    enum: [...HANDLE_IDS],
    description: 'Which side of the target node to attach to (optional).',
  },
}

function summarizeNode(node: DiagramNode, nodes: DiagramNode[]) {
  const abs = absolutePosition(nodes, node)
  const size = nodeSize(node)
  return {
    id: node.id,
    label: node.data.label,
    kind: isGroupNode(node) ? 'group' : node.data.shape,
    parent_id: node.parentId ?? null,
    x: Math.round(abs.x),
    y: Math.round(abs.y),
    width: Math.round(size.width),
    height: Math.round(size.height),
    ...(isGroupNode(node)
      ? { color: node.data.color ?? null }
      : {
          color: node.data.color ?? null,
          icon: node.data.icon ?? null,
          description: node.data.description ?? null,
        }),
  }
}

function summarizeEdge(edge: ReturnType<typeof store>['edges'][number]) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: typeof edge.label === 'string' ? edge.label : null,
    type: edge.type ?? 'smoothstep',
    animated: edge.animated ?? false,
  }
}

type EdgeSpecArgs = {
  label?: string
  type?: EdgePathType
  animated?: boolean
  color?: string
  width?: number
  dashed?: boolean
  marker_start?: ArrowStyle
  marker_end?: ArrowStyle
  source_handle?: HandleId
  target_handle?: HandleId
}

function toEdgeSpec(args: EdgeSpecArgs) {
  return {
    label: args.label,
    type: args.type,
    animated: args.animated,
    color: args.color,
    width: args.width,
    dashed: args.dashed,
    markerStart: args.marker_start,
    markerEnd: args.marker_end,
    sourceHandle: args.source_handle,
    targetHandle: args.target_handle,
  }
}

export const diagramTools: ToolDef[] = [
  {
    name: 'describe_diagram',
    description:
      'Read the whole diagram: every node (id, label, kind, parent, position, size, color) and every edge (id, source, target, label, type). Call this before answering questions about the diagram or editing anything you did not just create.',
    parameters: { type: 'object', properties: {} },
    execute: () => {
      const { nodes, edges } = store()
      return {
        node_count: nodes.length,
        edge_count: edges.length,
        nodes: nodes.map((n) => summarizeNode(n, nodes)),
        edges: edges.map(summarizeEdge),
      }
    },
  },
  {
    name: 'get_node',
    description: 'Full detail for one node by id, including the edges connected to it.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Node id.' } },
      required: ['id'],
    },
    execute: (args) => {
      const { nodes, edges } = store()
      const id = args.id as string
      const node = nodes.find((n) => n.id === id)
      if (!node) throw new DiagramError(`no node with id "${id}"`)
      return {
        ...summarizeNode(node, nodes),
        children: nodes.filter((n) => n.parentId === id).map((n) => n.id),
        edges: edges.filter((e) => e.source === id || e.target === id).map(summarizeEdge),
      }
    },
  },
  {
    name: 'find',
    description:
      'Search nodes by id, label or description and edges by label (case-insensitive substring). Use to resolve what the user is referring to.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search text.' } },
      required: ['query'],
    },
    execute: (args) => {
      const q = (args.query as string).toLowerCase()
      const { nodes, edges } = store()
      return {
        nodes: nodes
          .filter(
            (n) =>
              n.id.toLowerCase().includes(q) ||
              n.data.label.toLowerCase().includes(q) ||
              (!isGroupNode(n) && (n.data.description ?? '').toLowerCase().includes(q)),
          )
          .map((n) => summarizeNode(n, nodes)),
        edges: edges
          .filter(
            (e) =>
              e.id.toLowerCase().includes(q) ||
              (typeof e.label === 'string' && e.label.toLowerCase().includes(q)),
          )
          .map(summarizeEdge),
      }
    },
  },
  {
    name: 'add_node',
    description:
      'Add a shape node to the diagram. Omit x/y to auto-place it; prefer calling auto_layout after adding several nodes.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Display label.' },
        shape: {
          type: 'string',
          enum: [...SHAPES],
          description:
            'Visual shape. "rounded" (default) / "rectangle" for components, "diamond" for decisions, "ellipse" for start/end, "cylinder" for databases/storage, "hexagon" for services/processes, "parallelogram" for input/output, "note" for sticky-note annotations, "text" for borderless freestanding labels (use with font_size for titles).',
        },
        parent_id: { type: 'string', description: 'Id of a group node to place this inside.' },
        ...nodeStyleProperties,
      },
      required: ['label'],
    },
    execute: (args) => {
      const node = store().addNode({
        label: args.label as string,
        shape: args.shape as Shape | undefined,
        parentId: args.parent_id as string | undefined,
        position:
          args.x !== undefined && args.y !== undefined
            ? { x: args.x as number, y: args.y as number }
            : undefined,
        width: args.width as number | undefined,
        height: args.height as number | undefined,
        color: args.color as string | undefined,
        textColor: args.text_color as string | undefined,
        borderColor: args.border_color as string | undefined,
        description: args.description as string | undefined,
        icon: args.icon as string | undefined,
        fontSize: args.font_size as number | undefined,
      })
      return { id: node.id }
    },
  },
  {
    name: 'add_group',
    description:
      'Add an empty labeled group (container) node. Put nodes inside it via add_node/update_node parent_id, or wrap existing nodes with group_nodes instead.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Group label.' },
        parent_id: { type: 'string', description: 'Parent group id for nesting.' },
        color: { type: 'string', description: `Tint color. ${COLOR_HINT}` },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['label'],
    },
    execute: (args) => {
      const group = store().addGroup({
        label: args.label as string,
        parentId: args.parent_id as string | undefined,
        color: args.color as string | undefined,
        position:
          args.x !== undefined && args.y !== undefined
            ? { x: args.x as number, y: args.y as number }
            : undefined,
        width: args.width as number | undefined,
        height: args.height as number | undefined,
      })
      return { id: group.id }
    },
  },
  {
    name: 'update_node',
    description:
      'Update any properties of a node (label, shape, colors, size, position, description, icon) or move it between groups with parent_id (null detaches it).',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node id to update.' },
        label: { type: 'string' },
        shape: { type: 'string', enum: [...SHAPES] },
        parent_id: {
          type: ['string', 'null'],
          description: 'New parent group id, or null to detach from its group.',
        },
        ...nodeStyleProperties,
      },
      required: ['id'],
    },
    execute: (args) => {
      const node = store().updateNode(args.id as string, {
        label: args.label as string | undefined,
        shape: args.shape as Shape | undefined,
        parentId: args.parent_id as string | null | undefined,
        position:
          args.x !== undefined && args.y !== undefined
            ? { x: args.x as number, y: args.y as number }
            : undefined,
        width: args.width as number | undefined,
        height: args.height as number | undefined,
        color: args.color as string | undefined,
        textColor: args.text_color as string | undefined,
        borderColor: args.border_color as string | undefined,
        description: args.description as string | undefined,
        icon: args.icon as string | undefined,
        fontSize: args.font_size as number | undefined,
      })
      return summarizeNode(node, store().nodes)
    },
  },
  {
    name: 'delete_node',
    description:
      'Delete a node by id. Deleting a group also deletes everything inside it (ungroup first to keep the contents). Connected edges are removed.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Node id to delete.' } },
      required: ['id'],
    },
    execute: (args) => store().deleteNode(args.id as string),
  },
  {
    name: 'add_edge',
    description: 'Connect two nodes with an edge. Defaults: smoothstep path, closed arrow at the target.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source node id.' },
        target: { type: 'string', description: 'Target node id.' },
        ...edgeStyleProperties,
      },
      required: ['source', 'target'],
    },
    execute: (args) => {
      const edge = store().addEdge({
        source: args.source as string,
        target: args.target as string,
        ...toEdgeSpec(args as EdgeSpecArgs),
      })
      return { id: edge.id }
    },
  },
  {
    name: 'update_edge',
    description: 'Update an edge: label, path type, styling, arrows, or reconnect its endpoints.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Edge id to update.' },
        source: { type: 'string', description: 'New source node id.' },
        target: { type: 'string', description: 'New target node id.' },
        ...edgeStyleProperties,
      },
      required: ['id'],
    },
    execute: (args) => {
      const edge = store().updateEdge(args.id as string, {
        source: args.source as string | undefined,
        target: args.target as string | undefined,
        ...toEdgeSpec(args as EdgeSpecArgs),
      })
      return summarizeEdge(edge)
    },
  },
  {
    name: 'delete_edge',
    description: 'Delete an edge by id.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Edge id to delete.' } },
      required: ['id'],
    },
    execute: (args) => {
      store().deleteEdge(args.id as string)
      return { deleted: args.id }
    },
  },
  {
    name: 'group_nodes',
    description:
      'Wrap existing nodes in a new labeled group. The nodes must currently share the same parent. Their canvas positions are preserved.',
    parameters: {
      type: 'object',
      properties: {
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Ids of the nodes to group.',
        },
        label: { type: 'string', description: 'Group label.' },
        color: { type: 'string', description: `Tint color. ${COLOR_HINT}` },
      },
      required: ['node_ids', 'label'],
    },
    execute: (args) => {
      const group = store().groupNodes(
        args.node_ids as string[],
        args.label as string,
        args.color as string | undefined,
      )
      return { id: group.id }
    },
  },
  {
    name: 'ungroup',
    description: 'Dissolve a group, keeping its contents in place on the canvas.',
    parameters: {
      type: 'object',
      properties: { group_id: { type: 'string', description: 'Group node id.' } },
      required: ['group_id'],
    },
    execute: (args) => {
      store().ungroup(args.group_id as string)
      return { ungrouped: args.group_id }
    },
  },
  {
    name: 'auto_layout',
    description:
      'Mechanical layered (dagre) auto-layout - it moves every node in scope, including inside nested groups, and resizes groups to fit. Direction is geometric, not semantic: LR just makes edges point rightward layer by layer. Great for pipelines, flowcharts and trees. Poor for spatial topologies (network zones, parallel lanes, region maps) - for those, hand-place the zone groups with update_node x/y/width/height and pass container_id here to tidy each group\'s interior only. After calling it, check the resulting positions with describe_diagram and fix anything awkward with align_nodes/distribute_nodes/update_node.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: [...LAYOUT_DIRECTIONS],
          description: 'Flow direction: LR (default), TB, RL or BT.',
        },
        container_id: {
          type: 'string',
          description:
            'Group id: lay out only this group\'s interior, leaving the rest of the diagram (and the group\'s own position) untouched. Omit for the whole diagram.',
        },
      },
    },
    execute: (args) => {
      store().autoLayout(
        args.direction as LayoutDirection | undefined,
        args.container_id as string | undefined,
      )
      return {
        layouted: true,
        direction: (args.direction as string | undefined) ?? 'LR',
        scope: (args.container_id as string | undefined) ?? 'diagram',
      }
    },
  },
  {
    name: 'align_nodes',
    description:
      'Align nodes that share a parent along one edge or center line: left/center/right (x axis) or top/middle/bottom (y axis). Use to line up lanes, tiers, or corresponding nodes across zones.',
    parameters: {
      type: 'object',
      properties: {
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: 'Ids of the nodes to align (same parent).',
        },
        alignment: {
          type: 'string',
          enum: [...ALIGNMENTS],
          description: 'left/center/right align x; top/middle/bottom align y.',
        },
      },
      required: ['node_ids', 'alignment'],
    },
    execute: (args) => {
      const moved = store().alignNodes(args.node_ids as string[], args.alignment as Alignment)
      return moved.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) }))
    },
  },
  {
    name: 'distribute_nodes',
    description:
      'Space nodes that share a parent evenly along an axis. With spacing set, packs them gap-by-gap from the first; without it, keeps the two outermost fixed and evens out the gaps between.',
    parameters: {
      type: 'object',
      properties: {
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: 'Ids of the nodes to distribute (same parent).',
        },
        axis: {
          type: 'string',
          enum: [...DISTRIBUTE_AXES],
          description: 'horizontal spaces along x; vertical along y.',
        },
        spacing: {
          type: 'number',
          description: 'Fixed gap in px between neighbours. Omit to spread between the outermost nodes.',
        },
      },
      required: ['node_ids', 'axis'],
    },
    execute: (args) => {
      const moved = store().distributeNodes(
        args.node_ids as string[],
        args.axis as DistributeAxis,
        args.spacing as number | undefined,
      )
      return moved.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) }))
    },
  },
  {
    name: 'clear_diagram',
    description: 'Delete every node and edge, leaving an empty canvas. Destructive; only when the user clearly asks for it.',
    parameters: { type: 'object', properties: {} },
    execute: () => {
      store().clear()
      return { cleared: true }
    },
  },
]

const toolsByName = new Map(diagramTools.map((t) => [t.name, t]))

/** Execute a tool by name with raw (untrusted) arguments. Never throws. */
export function executeTool(name: string, rawArgs: unknown): ToolResult {
  const tool = toolsByName.get(name)
  let result: ToolResult
  if (!tool) {
    result = { ok: false, error: `unknown tool "${name}"` }
  } else {
    try {
      const args = validateArgs(tool.parameters, rawArgs ?? {}) as Record<string, unknown>
      result = { ok: true, result: tool.execute(args) }
    } catch (err) {
      if (err instanceof SchemaError || err instanceof DiagramError) {
        result = { ok: false, error: err.message }
      } else {
        console.error('tool execution crashed', { tool: name, err })
        result = { ok: false, error: `internal error executing ${name}` }
      }
    }
  }
  const event: ToolCallEvent = {
    tool: name,
    args: (rawArgs as Record<string, unknown>) ?? {},
    result,
  }
  for (const listener of listeners) listener(event)
  return result
}

/** Parse a model-supplied JSON argument string and execute. Never throws. */
export function executeToolFromJson(name: string, argsJson: string): ToolResult {
  let args: unknown = {}
  if (argsJson.trim()) {
    try {
      args = JSON.parse(argsJson)
    } catch {
      return { ok: false, error: `arguments for ${name} were not valid JSON` }
    }
  }
  return executeTool(name, args)
}

/**
 * The registry in the flat function-tool shape shared by the OpenAI
 * Responses API and the GA Realtime API.
 */
export function toOpenAITools(): {
  type: 'function'
  name: string
  description: string
  parameters: JsonSchema
}[] {
  return diagramTools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}
