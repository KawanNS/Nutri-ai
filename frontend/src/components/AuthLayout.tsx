import type { ReactNode } from 'react'
import { BrandLogo } from './BrandLogo'

interface AuthLayoutProps { eyebrow: string; title: string; description: string; children: ReactNode }

export function AuthLayout({ eyebrow, title, description, children }: AuthLayoutProps) {
  return <main className="auth-page">
    <section className="auth-intro">
      <div className="brand brand--auth"><BrandLogo/></div>
      <div><p className="eyebrow">Nutrição com clareza</p><h1>Pequenas escolhas.<br/>Progresso real.</h1><p>Acompanhe sua evolução de forma simples e mantenha seus objetivos sempre por perto.</p></div>
    </section>
    <section className="auth-card" aria-labelledby="auth-title"><p className="eyebrow">{eyebrow}</p><h2 id="auth-title">{title}</h2><p className="auth-card__description">{description}</p>{children}</section>
  </main>
}
