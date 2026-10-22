import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { wakeApi } from './services/api'

wakeApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Screens behind sign-in load on demand; this shows while one downloads. */}
    <Suspense fallback={<div className="app-loading" role="status" aria-label="Carregando"><span className="ui-loading__spinner"/></div>}>
      <App />
    </Suspense>
  </StrictMode>,
)
