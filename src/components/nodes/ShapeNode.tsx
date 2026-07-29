import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import type { Shape, ShapeNode as ShapeNodeType } from '../../types/diagram'

const HANDLES: { id: string; position: Position }[] = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
]

/** Shapes drawn as SVG polygons (stroke stays crisp at any node size). */
const POLYGONS: Partial<Record<Shape, string>> = {
  diamond: '50,1 99,50 50,99 1,50',
  hexagon: '22,1 78,1 99,50 78,99 22,99 1,50',
  parallelogram: '15,1 99,1 85,99 1,99',
}

function SvgShape({ shape, fill, stroke }: { shape: Shape; fill: string; stroke: string }) {
  return (
    <svg className="shape-node__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {shape === 'cylinder' ? (
        <>
          <path
            d="M 1 14 A 49 12 0 0 1 99 14 L 99 86 A 49 12 0 0 1 1 86 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M 1 14 A 49 12 0 0 0 99 14"
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : (
        <polygon
          points={POLYGONS[shape]}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

export function ShapeNode({ data, selected }: NodeProps<ShapeNodeType>) {
  const shape = data.shape
  const isSvg = shape === 'diamond' || shape === 'hexagon' || shape === 'parallelogram' || shape === 'cylinder'
  const isText = shape === 'text'
  const isNote = shape === 'note'

  const fill = data.color ?? (isNote ? '#fef9c3' : '#ffffff')
  const stroke = data.borderColor ?? (isNote ? '#eab308' : '#334155')
  const text = data.textColor ?? '#0f172a'

  const boxStyle: React.CSSProperties = isSvg
    ? {}
    : isText
      ? { background: data.color ?? 'transparent' }
      : {
          background: fill,
          border: `1.5px solid ${stroke}`,
          borderRadius:
            shape === 'ellipse' ? '50%' : shape === 'rounded' || shape === 'note' ? '10px' : '0px',
        }

  return (
    <div className="shape-node" style={{ color: text }} title={data.description}>
      <NodeResizer isVisible={selected} minWidth={40} minHeight={28} />
      <div className="shape-node__box" style={boxStyle}>
        {isSvg && <SvgShape shape={shape} fill={fill} stroke={stroke} />}
        <div
          className="shape-node__label"
          style={data.fontSize ? { fontSize: data.fontSize } : undefined}
        >
          {data.icon ? <span className="shape-node__icon">{data.icon}</span> : null}
          <span>{data.label}</span>
        </div>
      </div>
      {HANDLES.map((h) => (
        <Handle key={h.id} id={h.id} type="source" position={h.position} />
      ))}
    </div>
  )
}
