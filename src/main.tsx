import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SyncProvider } from './lib/sync'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SyncProvider>
      <App />
    </SyncProvider>
  </React.StrictMode>,
)
