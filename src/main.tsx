import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SyncProvider } from './lib/sync'
import { I18nProvider } from './lib/i18n'
import './index.css'

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
