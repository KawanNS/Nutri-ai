import { useCallback, useEffect, useState } from 'react'
import { LoginPage } from './pages/LoginPage'
import { MealPlanPage } from './pages/MealPlanPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProgressPage } from './pages/ProgressPage'
import { RegisterPage } from './pages/RegisterPage'
import { ApiError } from './services/api'
import { getProfile } from './services/profileService'
import { AUTH_UNAUTHORIZED_EVENT, getToken, removeToken } from './services/authToken'
import type { Profile } from './types/profile'
import './App.css'

type View = 'login' | 'register' | 'checking-profile' | 'profile-error' | 'meal-plan' | 'profile' | 'progress'

function App() {
  const [view, setView] = useState<View>(() => getToken() ? 'checking-profile' : 'login')
  const [profile, setProfile] = useState<Profile | undefined>(), [progressNotice, setProgressNotice] = useState<string | undefined>()
  const [loginEmail, setLoginEmail] = useState(''), [loginNotice, setLoginNotice] = useState<string | undefined>()
  const loadProfile = useCallback(async () => {
    try { const response = await getProfile(); setProfile(response.profile); setView('meal-plan') }
    catch (error) {
      if (error instanceof ApiError && error.status === 404) { setProfile(undefined); setView('profile') }
      else if (!(error instanceof ApiError && error.status === 401)) setView('profile-error')
    }
  }, [])
  const checkProfile = () => { setView('checking-profile'); void loadProfile() }
  useEffect(() => {
    // Initial profile loading synchronizes the authenticated UI with the API.
    // oxlint-disable-next-line react/set-state-in-effect
    if (getToken()) void loadProfile()
    const handleUnauthorized = () => { setProfile(undefined); setLoginNotice('Sua sessão expirou. Entre novamente.'); setView('login') }
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [loadProfile])
  const logout = () => { removeToken(); setProfile(undefined); setProgressNotice(undefined); setLoginNotice(undefined); setView('login') }
  if (view === 'register') return <RegisterPage onLogin={() => setView('login')} onRegistered={(email) => { setLoginEmail(email); setLoginNotice('Conta criada. Entre para continuar.'); setView('login') }}/>
  if (view === 'checking-profile') return <div className="app-loading"><div className="brand"><span className="brand__mark">N</span><span>Nutri-AI</span></div><span className="spinner" aria-label="Carregando perfil"/></div>
  if (view === 'profile-error') return <div className="app-loading"><p>Não foi possível carregar seu perfil.</p><button className="button button--primary" type="button" onClick={() => void checkProfile()}>Tentar novamente</button><button className="logout-button" type="button" onClick={logout}>Sair</button></div>
  if (view === 'profile' && getToken()) return <ProfilePage profile={profile} required={!profile} onLogout={logout} onMealPlan={() => setView('meal-plan')} onProgress={() => setView('progress')} onSaved={(savedProfile, wasFirstProfile) => { setProfile(savedProfile); if (wasFirstProfile) { setProgressNotice(undefined); setView('meal-plan') } }}/>
  if (view === 'meal-plan' && getToken() && profile) return <MealPlanPage onProfile={() => setView('profile')} onProgress={() => setView('progress')} onLogout={logout}/>
  if (view === 'progress' && getToken() && profile) return <ProgressPage notice={progressNotice} onMealPlan={() => setView('meal-plan')} onProfile={() => { setProgressNotice(undefined); setView('profile') }} onLogout={logout}/>
  return <LoginPage initialEmail={loginEmail} notice={loginNotice} onAuthenticated={() => { setLoginNotice(undefined); void checkProfile() }} onRegister={() => { setLoginNotice(undefined); setView('register') }}/>
}
export default App
