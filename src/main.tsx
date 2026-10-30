import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SyncProvider } from './lib/sync'
import { I18nProvider } from './lib/i18n'
import './index.css'
import { initAnalytics } from './landing/analytics'
import { initMonitoring } from './lib/monitoring'

initAnalytics()
initMonitoring()
// An invite link (?ref=CODE) keeps the friend's code for the sign-up form.
try {
  const ref = new URLSearchParams(window.location.search).get('ref')
  if (ref) localStorage.setItem('pg-ref', ref.toUpperCase().slice(0, 12))
} catch {
  /* private mode: the code can still be typed */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </I18nProvider>
  </React.StrictMode>,
)

// Offline support. Registered after load so it never competes with the first
// paint, and skipped on the dev server where it would cache stale modules.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a bonus, not a requirement */
    })
  })
}
