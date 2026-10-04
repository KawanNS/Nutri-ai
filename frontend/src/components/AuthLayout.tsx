import type { ReactNode } from 'react'
import mealPhoto from '../assets/landing/differentials-food-photo.png'
import { BrandLogo } from './BrandLogo'
import { Surface } from './ui/Surface'
import './AuthLayout.css'

interface AuthLayoutProps {
  eyebrow: string
  title: string
  description: string
  visualTitle: string
  visualDescription: string
  onHome(): void
  children: ReactNode
}

export function AuthLayout({ eyebrow, title, description, visualTitle, visualDescription, onHome, children }: AuthLayoutProps) {
  return <main className="auth-shell">
    <aside className="auth-shell__visual" aria-label="Alyvora, sua alimentação cabe na sua vida">
      <button className="auth-shell__brand" type="button" onClick={onHome} aria-label="Voltar para a página inicial">
        <BrandLogo/>
      </button>
      <div className="auth-shell__visual-copy">
        <p className="auth-shell__eyebrow">Sua alimentação cabe na sua vida.</p>
        <h2>{visualTitle}</h2>
        <p>{visualDescription}</p>
      </div>
      <figure className="auth-shell__photo">
        <img src={mealPhoto} alt="Prato equilibrado com frango, grãos e vegetais"/>
        <figcaption><span aria-hidden="true">✓</span> Escolhas reais, no seu ritmo.</figcaption>
      </figure>
      <span className="auth-shell__leaf auth-shell__leaf--one" aria-hidden="true"/>
      <span className="auth-shell__leaf auth-shell__leaf--two" aria-hidden="true"/>
    </aside>

    <section className="auth-shell__content">
      <button className="auth-shell__mobile-brand" type="button" onClick={onHome} aria-label="Voltar para a página inicial">
        <BrandLogo/>
      </button>
      <Surface as="section" level="base" padded={false} className="auth-shell__card" aria-labelledby="auth-title">
        <header className="auth-shell__heading">
          <p className="auth-shell__eyebrow">{eyebrow}</p>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </Surface>
      <p className="auth-shell__security"><span aria-hidden="true">⌁</span> Seus dados de acesso são enviados de forma segura.</p>
    </section>
  </main>
}
