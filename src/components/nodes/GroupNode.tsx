import { NodeResizer, type NodeProps } from '@xyflow/react'
import type { GroupNode as GroupNodeType } from '../../types/diagram'

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  const tint = data.color ?? '#64748b'
  return (
    <div className="group-node" style={{ borderColor: tint }}>
      <NodeResizer isVisible={selected} minWidth={120} minHeight={80} />
      <div className="group-node__tint" style={{ background: tint }} />
      <div className="group-node__label" style={{ color: tint }}>
        {data.label}
      </div>
    </div>
  )
}
