import { ReactFlowProvider } from '@xyflow/react'
import { ChatPanel } from './components/ChatPanel'
import { DiagramCanvas } from './components/DiagramCanvas'
import { TopBar } from './components/TopBar'
import { VoiceDock } from './components/VoiceDock'

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        <div className="app__main">
          <DiagramCanvas />
          <ChatPanel />
        </div>
        <VoiceDock />
      </div>
    </ReactFlowProvider>
  )
}
