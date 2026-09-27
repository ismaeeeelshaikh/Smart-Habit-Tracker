import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initInstallPrompt } from './pwa/install'

// Before render: the browser's install offer can arrive before any screen does.
initInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
