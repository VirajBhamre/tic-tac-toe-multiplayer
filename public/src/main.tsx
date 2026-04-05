import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (import.meta.env.VITE_HOSTING_KEEPALIVE === 'true') {
  import('./services/hostingKeepalive').then((m) => m.startHostingKeepalive())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
