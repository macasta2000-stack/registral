import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'

// ── Auto-reload on stale chunk error ──
// After a new deploy, old cached JS filenames no longer exist.
// Detect the error and force a clean reload (once, to avoid loops).
window.addEventListener('error', (e) => {
  if (
    e.message?.includes('Failed to fetch dynamically imported module') ||
    e.message?.includes('Importing a module script failed')
  ) {
    const key = 'registral-chunk-reload'
    const last = sessionStorage.getItem(key)
    const now = Date.now()
    // Only reload if we haven't reloaded in the last 10 seconds (avoid loop)
    if (!last || now - Number(last) > 10_000) {
      sessionStorage.setItem(key, String(now))
      window.location.reload()
    }
  }
})

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || '')
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed')
  ) {
    const key = 'registral-chunk-reload'
    const last = sessionStorage.getItem(key)
    const now = Date.now()
    if (!last || now - Number(last) > 10_000) {
      sessionStorage.setItem(key, String(now))
      window.location.reload()
    }
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>
)
