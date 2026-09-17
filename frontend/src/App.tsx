import { useCallback, useEffect, useState } from 'react'
import { LoginPage } from './pages/LoginPage'
import { AdminRouterPage } from './pages/AdminRouterPage'
import { LandingPage } from './pages/LandingPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { MealPlanPage } from './pages/MealPlanPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProgressPage } from './pages/ProgressPage'
import { RegisterPage } from './pages/RegisterPage'
import { ApiError } from './services/api'
import { getProfile } from './services/profileService'
import { AUTH_UNAUTHORIZED_EVENT, getRole, getToken, removeToken } from './services/authToken'
import type { Profile, ProfileOnboardingDraft } from './types/profile'
import './App.css'

type View = 'landing' | 'onboarding' | 'login' | 'register' | 'checking-profile' | 'profile-error' | 'meal-plan' | 'profile' | 'progress' | 'admin'

function App() {
  const [view, setView] = useState<View>(() => getToken() ? getRole() === 'ADMIN' ? 'admin' : 'checking-profile' : 'landing')
  const [profile, setProfile] = useState<Profile | undefined>(), [progressNotice, setProgressNotice] = useState<string | undefined>()
  const [onboardingDraft, setOnboardingDraft] = useState<ProfileOnboardingDraft | undefined>()
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
  const logout = () => { removeToken(); setProfile(undefined); setOnboardingDraft(undefined); setProgressNotice(undefined); setLoginNotice(undefined); setView('login') }
  if (view === 'landing') return <LandingPage onLogin={() => setView('login')} onRegister={() => setView('register')} onStart={() => setView('onboarding')}/>
  if (view === 'onboarding') return <OnboardingPage onBack={() => setView('landing')} onComplete={(draft) => { setOnboardingDraft(draft); setView('register') }}/>
  if (view === 'register') return <RegisterPage onHome={() => setView('landing')} onLogin={() => setView('login')} onRegistered={(email) => { setLoginEmail(email); setLoginNotice('Conta criada. Entre para continuar.'); setView('login') }}/>
  if (view === 'admin' && getToken()) return <AdminRouterPage onApp={checkProfile} onLogout={logout}/>
  if (view === 'checking-profile') return <div className="app-loading"><div className="brand"><span className="brand__mark">N</span><span>Nutri-AI</span></div><span className="spinner" aria-label="Carregando perfil"/></div>
  if (view === 'profile-error') return <div className="app-loading"><p>Não foi possível carregar seu perfil.</p><button className="button button--primary" type="button" onClick={() => void checkProfile()}>Tentar novamente</button><button className="logout-button" type="button" onClick={logout}>Sair</button></div>
  if (view === 'profile' && getToken()) return <ProfilePage profile={profile} draft={profile ? undefined : onboardingDraft} required={!profile} onLogout={logout} onMealPlan={() => setView('meal-plan')} onProgress={() => setView('progress')} onSaved={(savedProfile, wasFirstProfile) => { setProfile(savedProfile); setOnboardingDraft(undefined); if (wasFirstProfile) { setProgressNotice(undefined); setView('meal-plan') } }}/>
  if (view === 'meal-plan' && getToken() && profile) return <MealPlanPage onProfile={() => setView('profile')} onProgress={() => setView('progress')} onLogout={logout}/>
  if (view === 'progress' && getToken() && profile) return <ProgressPage notice={progressNotice} onMealPlan={() => setView('meal-plan')} onProfile={() => { setProgressNotice(undefined); setView('profile') }} onLogout={logout}/>
  return <LoginPage initialEmail={loginEmail} notice={loginNotice} onHome={() => setView('landing')} onAuthenticated={(role) => { setLoginNotice(undefined); if (role === 'ADMIN') setView('admin'); else void checkProfile() }} onRegister={() => { setLoginNotice(undefined); setView('register') }}/>
}
export default App
