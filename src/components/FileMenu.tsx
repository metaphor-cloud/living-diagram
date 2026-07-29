import { useReactFlow } from '@xyflow/react'
import { useRef, useState } from 'react'
import { downloadBytes, downloadDataUrl, exportDiagramImage } from '../lib/exportImage'
import { deserializeDiagram, FILE_EXTENSION, serializeDiagram } from '../lib/fileFormat'
import { useDiagramStore } from '../store/diagram'

export function FileMenu() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const { fitView } = useReactFlow()

  const run = async (action: () => Promise<void>) => {
    setOpen(false)
    setError(null)
    try {
      await action()
    } catch (err) {
      console.error('file action failed', err)
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const save = () =>
    run(async () => {
      const { nodes, edges } = useDiagramStore.getState()
      const bytes = await serializeDiagram(nodes, edges)
      downloadBytes(bytes, `diagram${FILE_EXTENSION}`)
    })

  const load = async (file: File) =>
    run(async () => {
      const { nodes, edges } = await deserializeDiagram(await file.arrayBuffer())
      useDiagramStore.getState().replaceAll(nodes, edges)
      requestAnimationFrame(() => void fitView({ padding: 0.15 }))
    })

  const exportImage = (kind: 'png' | 'svg') =>
    run(async () => {
      const { nodes } = useDiagramStore.getState()
      const { dataUrl, filename } = await exportDiagramImage(kind, nodes)
      downloadDataUrl(dataUrl, filename)
    })

  return (
    <div className="filemenu">
      <button className="btn" onClick={() => setOpen((o) => !o)}>
        File ▾
      </button>
      {open && (
        <>
          <div className="filemenu__backdrop" onClick={() => setOpen(false)} />
          <div className="filemenu__list">
            <button onClick={() => void save()}>Save {FILE_EXTENSION}</button>
            <button onClick={() => fileInput.current?.click()}>Load {FILE_EXTENSION}…</button>
            <button onClick={() => void exportImage('png')}>Export PNG</button>
            <button onClick={() => void exportImage('svg')}>Export SVG</button>
          </div>
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        accept={FILE_EXTENSION}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          setOpen(false)
          if (file) void load(file)
        }}
      />
      {error && (
        <div className="filemenu__error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  )
}
