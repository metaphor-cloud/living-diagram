import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import type { DiagramNode } from '../types/diagram'

/**
 * High-quality image export straight from the live React Flow DOM:
 * fit-to-content bounds with padding, 2x pixel ratio for PNG.
 */

const PADDING_PX = 60
const MAX_DIMENSION = 4096
const PIXEL_RATIO = 2

export async function exportDiagramImage(
  kind: 'png' | 'svg',
  nodes: DiagramNode[],
): Promise<{ dataUrl: string; filename: string }> {
  if (nodes.length === 0) throw new Error('the diagram is empty - nothing to export')
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!viewport) throw new Error('diagram canvas not found')

  const bounds = getNodesBounds(nodes)
  const width = Math.min(Math.ceil(bounds.width) + PADDING_PX * 2, MAX_DIMENSION)
  const height = Math.min(Math.ceil(bounds.height) + PADDING_PX * 2, MAX_DIMENSION)
  const viewportForBounds = getViewportForBounds(bounds, width, height, 0.1, 4, 0.08)

  const options = {
    backgroundColor: '#ffffff',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewportForBounds.x}px, ${viewportForBounds.y}px) scale(${viewportForBounds.zoom})`,
    },
    filter: (element: HTMLElement) =>
      !element.classList?.contains('react-flow__minimap') &&
      !element.classList?.contains('react-flow__controls'),
  }

  const dataUrl =
    kind === 'png'
      ? await toPng(viewport, { ...options, pixelRatio: PIXEL_RATIO })
      : await toSvg(viewport, options)

  return { dataUrl, filename: `diagram.${kind}` }
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/gzip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
