import { useEffect, useState } from 'react'
import { LoginPage } from './pages/LoginPage'
import { ProgressPage } from './pages/ProgressPage'
import { RegisterPage } from './pages/RegisterPage'
import { AUTH_UNAUTHORIZED_EVENT, getToken, removeToken } from './services/authToken'
import './App.css'

type View = 'login' | 'register' | 'progress'

function App() {
  const [view, setView] = useState<View>(() => getToken() ? 'progress' : 'login')
  const [loginEmail, setLoginEmail] = useState(''), [loginNotice, setLoginNotice] = useState<string | undefined>()
  useEffect(() => {
    const handleUnauthorized = () => { setLoginNotice('Sua sessão expirou. Entre novamente.'); setView('login') }
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [])
  if (view === 'register') return <RegisterPage onLogin={() => setView('login')} onRegistered={(email) => { setLoginEmail(email); setLoginNotice('Conta criada. Entre para continuar.'); setView('login') }}/>
  if (view === 'progress' && getToken()) return <ProgressPage onLogout={() => { removeToken(); setLoginNotice(undefined); setView('login') }}/>
  return <LoginPage initialEmail={loginEmail} notice={loginNotice} onAuthenticated={() => { setLoginNotice(undefined); setView('progress') }} onRegister={() => { setLoginNotice(undefined); setView('register') }}/>
}
export default App
