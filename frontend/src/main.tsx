import { StrictMode, Suspense } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { wakeApi } from './services/api'
import { captureAcquisitionFromUrl } from './services/acquisition'
import { AlyvoraLoader } from './components/AlyvoraLoader'

wakeApi()
// Before the first render, so a campaign link can open the questions directly.
captureAcquisitionFromUrl()

// With autoUpdate, the page reloads by itself once a new version is installed. Long-open tabs and
// installed apps also check for a new version every hour.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) window.setInterval(() => { void registration.update() }, 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Screens behind sign-in load on demand; this shows while one downloads. */}
    <Suspense fallback={<div className="app-loading" role="status"><AlyvoraLoader size={64} label="Carregando"/></div>}>
      <App />
    </Suspense>
  </StrictMode>,
)
