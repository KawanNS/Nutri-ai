import { useCallback, useEffect, useState } from 'react'
import { LoginPage } from './pages/LoginPage'
import { AdminRouterPage } from './pages/AdminRouterPage'
import { LandingPage } from './pages/LandingPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { MealPlanPage } from './pages/MealPlanPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProgressPage } from './pages/ProgressPage'
import { RegisterPage } from './pages/RegisterPage'
import { ChatPage } from './pages/ChatPage'
import { MealPhotoPage } from './pages/MealPhotoPage'
import { BrandLogo } from './components/BrandLogo'
import { ApiError } from './services/api'
import { getCurrentUser } from './services/authService'
import { getProfile } from './services/profileService'
import { AUTH_UNAUTHORIZED_EVENT, getToken, removeToken, saveRole } from './services/authToken'
import type { Profile, ProfileOnboardingDraft } from './types/profile'
import './App.css'

type View = 'landing' | 'onboarding' | 'login' | 'register' | 'checking-profile' | 'profile-error' | 'meal-plan' | 'chat' | 'meal-photo' | 'profile' | 'progress' | 'admin'

function App() {
  const [view, setView] = useState<View>(() => getToken() ? 'checking-profile' : 'landing')
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
  const restoreAuthenticatedSession = useCallback(async () => {
    try {
      const { user } = await getCurrentUser()
      saveRole(user.role)
      if (user.role === 'ADMIN') setView('admin')
      else await loadProfile()
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setView('profile-error')
    }
  }, [loadProfile])
  const checkProfile = () => { setView('checking-profile'); void loadProfile() }
  useEffect(() => {
    // Initial session loading synchronizes the authenticated UI with the API.
    const handleUnauthorized = () => { setProfile(undefined); setLoginNotice('Sua sessão expirou. Entre novamente.'); setView('login') }
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    // oxlint-disable-next-line react/set-state-in-effect
    if (getToken()) void restoreAuthenticatedSession()
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [restoreAuthenticatedSession])
  const logout = () => { removeToken(); setProfile(undefined); setOnboardingDraft(undefined); setProgressNotice(undefined); setLoginNotice(undefined); setView('login') }
  if (view === 'landing') return <LandingPage onLogin={() => setView('login')} onRegister={() => setView('register')} onStart={() => setView('onboarding')}/>
  if (view === 'onboarding') return <OnboardingPage onBack={() => setView('landing')} onComplete={(draft) => { setOnboardingDraft(draft); setView('register') }}/>
  if (view === 'register') return <RegisterPage onHome={() => setView('landing')} onLogin={() => setView('login')} onRegistered={(email) => { setLoginEmail(email); setLoginNotice('Conta criada. Entre para continuar.'); setView('login') }}/>
  if (view === 'admin' && getToken()) return <AdminRouterPage onApp={checkProfile} onLogout={logout}/>
  if (view === 'checking-profile') return <div className="app-loading"><div className="brand"><BrandLogo/></div><span className="spinner" aria-label="Carregando perfil"/></div>
  if (view === 'profile-error') return <div className="app-loading"><p>Não foi possível carregar seu perfil.</p><button className="button button--primary" type="button" onClick={() => void checkProfile()}>Tentar novamente</button><button className="logout-button" type="button" onClick={logout}>Sair</button></div>
  if (view === 'profile' && getToken()) return <ProfilePage profile={profile} draft={profile ? undefined : onboardingDraft} required={!profile} onLogout={logout} onMealPlan={() => setView('meal-plan')} onChat={() => setView('chat')} onProgress={() => setView('progress')} onSaved={(savedProfile, wasFirstProfile) => { setProfile(savedProfile); setOnboardingDraft(undefined); if (wasFirstProfile) { setProgressNotice(undefined); setView('meal-plan') } }}/>
  if (view === 'meal-plan' && getToken() && profile) return <MealPlanPage onProfile={() => setView('profile')} onChat={() => setView('chat')} onMealPhoto={() => setView('meal-photo')} onProgress={() => setView('progress')} onLogout={logout}/>
  if (view === 'chat' && getToken() && profile) return <ChatPage onMealPlan={() => setView('meal-plan')} onProfile={() => setView('profile')} onProgress={() => setView('progress')} onLogout={logout}/>
  if (view === 'meal-photo' && getToken() && profile) return <MealPhotoPage onMealPlan={() => setView('meal-plan')} onChat={() => setView('chat')} onProfile={() => setView('profile')} onProgress={() => setView('progress')} onLogout={logout}/>
  if (view === 'progress' && getToken() && profile) return <ProgressPage notice={progressNotice} onMealPlan={() => setView('meal-plan')} onChat={() => setView('chat')} onProfile={() => { setProgressNotice(undefined); setView('profile') }} onLogout={logout}/>
  return <LoginPage initialEmail={loginEmail} notice={loginNotice} onHome={() => setView('landing')} onAuthenticated={() => { setLoginNotice(undefined); setView('checking-profile'); void restoreAuthenticatedSession() }} onRegister={() => { setLoginNotice(undefined); setView('register') }}/>
}
export default App
