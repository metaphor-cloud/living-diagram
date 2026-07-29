import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useShallow } from 'zustand/react/shallow'
import { useDiagramStore } from '../store/diagram'
import { useSettingsStore } from '../store/settings'
import { GroupNode } from './nodes/GroupNode'
import { ShapeNode } from './nodes/ShapeNode'

const nodeTypes: NodeTypes = {
  shape: ShapeNode,
  group: GroupNode,
}

const edgeTypes: EdgeTypes = {}

export function DiagramCanvas() {
  const showMinimap = useSettingsStore((s) => s.showMinimap)
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useDiagramStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
    })),
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Loose}
      fitView
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} />
      <Controls />
      {showMinimap && <MiniMap pannable zoomable />}
    </ReactFlow>
  )
}
