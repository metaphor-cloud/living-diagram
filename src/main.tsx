import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initAutosave } from './lib/autosave'
import './index.css'

initAutosave(localStorage)

const root = document.getElementById('root')
if (!root) {
  throw new Error('root element missing from index.html')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
