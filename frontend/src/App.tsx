import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LoginPage } from './pages/LoginPage'
import { AdminRouterPage } from './pages/AdminRouterPage'
import { LandingPage } from './pages/LandingPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PlanPreviewPage } from './pages/PlanPreviewPage'
import { MealPlanPage } from './pages/MealPlanPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProgressPage } from './pages/ProgressPage'
import { RegisterPage } from './pages/RegisterPage'
import { ChatPage } from './pages/ChatPage'
import { MealPhotoPage } from './pages/MealPhotoPage'
import { DiaryPage } from './pages/DiaryPage'
import { SubscriptionPage } from './pages/SubscriptionPage'
import { BrandLogo } from './components/BrandLogo'
import { AccountMenuContext, type AccountMenuValue, type PremiumState } from './components/layout/accountMenuContext'
import { ApiError } from './services/api'
import { getCurrentUser } from './services/authService'
import { getProfile } from './services/profileService'
import { getSubscription, waitForPremiumConfirmation } from './services/billingService'
import { AUTH_UNAUTHORIZED_EVENT, getToken, removeToken, saveRole } from './services/authToken'
import type { AuthUser } from './types/auth'
import type { PlanPreview } from './types/planPreview'
import type { Profile, ProfileOnboardingDraft } from './types/profile'
import './App.css'

type View = 'landing' | 'onboarding' | 'plan-preview' | 'login' | 'register' | 'checking-profile' | 'profile-error' | 'meal-plan' | 'chat' | 'meal-photo' | 'diary' | 'profile' | 'progress' | 'subscription' | 'admin'

function App() {
  const [view, setView] = useState<View>(() => getToken() ? 'checking-profile' : 'landing')
  const [profile, setProfile] = useState<Profile | undefined>(), [progressNotice, setProgressNotice] = useState<string | undefined>()
  const [onboardingDraft, setOnboardingDraft] = useState<ProfileOnboardingDraft | undefined>()
  // The preview of the visitor's Monday, kept while they go back and forth so it is generated once per answers.
  const [planPreview, setPlanPreview] = useState<PlanPreview | undefined>()
  const handlePreviewLoaded = useCallback((preview: PlanPreview) => setPlanPreview(preview), [])
  const [loginEmail, setLoginEmail] = useState(''), [loginNotice, setLoginNotice] = useState<string | undefined>()
  const [account, setAccount] = useState<AuthUser | undefined>(), [premium, setPremium] = useState<PremiumState>('loading')
  // Responses from an earlier session or a superseded check must not overwrite the current Premium state.
  const premiumRequest = useRef(0)
  const refreshPremium = useCallback(async () => {
    const request = ++premiumRequest.current
    setPremium('loading')
    try {
      const { subscription } = await getSubscription()
      if (request === premiumRequest.current) setPremium(subscription.adminAccess ? 'admin' : subscription.isPremium ? 'premium' : 'free')
    } catch {
      if (request === premiumRequest.current) setPremium('unavailable')
    }
  }, [])
  const resetAccount = useCallback(() => { premiumRequest.current += 1; setAccount(undefined); setPremium('loading') }, [])
  const loadAccount = useCallback(async () => {
    void refreshPremium()
    try { setAccount((await getCurrentUser()).user) }
    catch { /* The menu falls back to a generic account label. */ }
  }, [refreshPremium])
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
      setAccount(user)
      let premiumConfirmed = false
      if (user.role !== 'ADMIN') {
        const query = new URLSearchParams(window.location.search)
        const billingReturn = query.get('billing_return')
        if (billingReturn && /^[A-Za-z0-9_-]{43}$/.test(billingReturn)) {
          premiumConfirmed = await waitForPremiumConfirmation()
          query.delete('billing_return')
          const suffix = query.toString()
          window.history.replaceState(null, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}${window.location.hash}`)
        }
      }
      if (premiumConfirmed) { premiumRequest.current += 1; setPremium('premium') }
      else void refreshPremium()
      if (user.role === 'ADMIN') setView('admin')
      else await loadProfile()
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setView('profile-error')
    }
  }, [loadProfile, refreshPremium])
  const checkProfile = () => { setView('checking-profile'); void loadProfile() }
  useEffect(() => {
    // Initial session loading synchronizes the authenticated UI with the API.
    const handleUnauthorized = () => { setProfile(undefined); resetAccount(); setLoginNotice('Sua sessão expirou. Entre novamente.'); setView('login') }
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    // oxlint-disable-next-line react/set-state-in-effect
    if (getToken()) void restoreAuthenticatedSession()
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [restoreAuthenticatedSession, resetAccount])
  const logout = () => { removeToken(); setProfile(undefined); resetAccount(); setOnboardingDraft(undefined); setProgressNotice(undefined); setLoginNotice(undefined); setView('login') }
  if (view === 'landing') return <LandingPage onLogin={() => setView('login')} onRegister={() => setView('register')} onStart={() => setView('onboarding')}/>
  if (view === 'onboarding') return <OnboardingPage initial={onboardingDraft} onBack={() => setView('landing')} onComplete={(draft) => { if (JSON.stringify(draft) !== JSON.stringify(onboardingDraft)) setPlanPreview(undefined); setOnboardingDraft(draft); setView('plan-preview') }}/>
  if (view === 'plan-preview' && onboardingDraft) return <PlanPreviewPage draft={onboardingDraft} preview={planPreview} onLoaded={handlePreviewLoaded} onBack={() => setView('onboarding')} onRegister={() => setView('register')} onHome={() => setView('landing')}/>
  const handleAuthenticated = (role: 'USER' | 'ADMIN') => { setLoginNotice(undefined); void loadAccount(); if (role === 'ADMIN') { setView('admin'); return } setView('checking-profile'); void loadProfile() }
  if (view === 'register') return <RegisterPage onHome={() => setView('landing')} onLogin={() => setView('login')} onRegistered={(email) => { setLoginEmail(email); setLoginNotice('Conta criada. Entre para continuar.'); setView('login') }} onAuthenticated={handleAuthenticated}/>
  if (view === 'admin' && getToken()) return <AdminRouterPage onApp={checkProfile} onLogout={logout}/>
  if (view === 'checking-profile') return <div className="app-loading"><div className="brand"><BrandLogo/></div><span className="spinner" aria-label="Carregando perfil"/></div>
  if (view === 'profile-error') return <div className="app-loading"><p>Não foi possível carregar seu perfil.</p><button className="button button--primary" type="button" onClick={() => void checkProfile()}>Tentar novamente</button><button className="logout-button" type="button" onClick={logout}>Sair</button></div>
  const accountMenu: AccountMenuValue = {
    account,
    premium,
    onProfile: () => { if (view === 'progress') setProgressNotice(undefined); setView('profile') },
    onSubscription: () => setView('subscription'),
    onLogout: logout,
  }
  const withAccountMenu = (page: ReactNode) => <AccountMenuContext.Provider value={accountMenu}>{page}</AccountMenuContext.Provider>
  if (view === 'profile' && getToken()) return withAccountMenu(<ProfilePage profile={profile} draft={profile ? undefined : onboardingDraft} required={!profile} onMealPlan={() => setView('meal-plan')} onChat={() => setView('chat')} onDiary={() => setView('diary')} onProgress={() => setView('progress')} onSaved={(savedProfile, wasFirstProfile) => { setProfile(savedProfile); setOnboardingDraft(undefined); if (wasFirstProfile) { setProgressNotice(undefined); setView('meal-plan') } }}/>)
  if (view === 'meal-plan' && getToken() && profile) return withAccountMenu(<MealPlanPage onProfile={() => setView('profile')} onChat={() => setView('chat')} onMealPhoto={() => setView('meal-photo')} onDiary={() => setView('diary')} onProgress={() => setView('progress')}/>)
  if (view === 'chat' && getToken() && profile) return withAccountMenu(<ChatPage onMealPlan={() => setView('meal-plan')} onDiary={() => setView('diary')} onProgress={() => setView('progress')}/>)
  if (view === 'meal-photo' && getToken() && profile) return withAccountMenu(<MealPhotoPage onMealPlan={() => setView('meal-plan')} onChat={() => setView('chat')} onDiary={() => setView('diary')} onProgress={() => setView('progress')}/>)
  if (view === 'diary' && getToken() && profile) return withAccountMenu(<DiaryPage onMealPlan={() => setView('meal-plan')} onChat={() => setView('chat')} onMealPhoto={() => setView('meal-photo')} onProgress={() => setView('progress')}/>)
  if (view === 'progress' && getToken() && profile) return withAccountMenu(<ProgressPage notice={progressNotice} onMealPlan={() => setView('meal-plan')} onChat={() => setView('chat')} onDiary={() => setView('diary')}/>)
  if (view === 'subscription' && getToken() && profile) return withAccountMenu(<SubscriptionPage onMealPlan={() => setView('meal-plan')} onChat={() => setView('chat')} onDiary={() => setView('diary')} onProgress={() => setView('progress')} onRetry={() => void refreshPremium()}/>)
  return <LoginPage initialEmail={loginEmail} notice={loginNotice} onHome={() => setView('landing')} onAuthenticated={handleAuthenticated} onRegister={() => { setLoginNotice(undefined); setView('register') }}/>
}
export default App
