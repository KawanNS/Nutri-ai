import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { wakeApi } from './services/api'
import { AlyvoraLoader } from './components/AlyvoraLoader'

wakeApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Screens behind sign-in load on demand; this shows while one downloads. */}
    <Suspense fallback={<div className="app-loading" role="status"><AlyvoraLoader size={64} label="Carregando"/></div>}>
      <App />
    </Suspense>
  </StrictMode>,
)
