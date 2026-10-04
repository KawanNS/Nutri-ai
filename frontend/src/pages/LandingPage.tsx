import { useId, useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { PhoneShowcase } from '../components/landing/PhoneShowcase'
import { Button } from '../components/ui/Button'
import avocadoDecor from '../assets/landing/Abacate Fresco com Caroço e Gotas.png'
import mealPhoto from '../assets/landing/differentials-food-photo.png'
import leafDecor from '../assets/landing/Folhas Verdes Flutuando em Transparência.png'
import tomatoDecor from '../assets/landing/Tomate vermelho com gotas de água.png'
import { premiumFeatures, subscriptionPlans } from '../data/subscriptionPlans'
import './LandingPage.css'

interface Props { onLogin(): void; onRegister(): void; onStart(): void }

const publicLinks = [
  ['Início', '#inicio'],
  ['Funcionalidades', '#funcionalidades'],
  ['Como funciona', '#como-funciona'],
  ['Planos', '#planos'],
  ['FAQ', '#faq'],
] as const

const features = [
  { icon: 'plan', title: 'Plano alimentar personalizado', description: 'Sete dias organizados a partir da sua rotina, preferências, restrições e orçamento.' },
  { icon: 'camera', title: 'Foto do prato', description: 'Envie uma foto, revise a estimativa dos alimentos e registre apenas o que você confirmar.' },
  { icon: 'assistant', title: 'Assistente', description: 'Converse sobre seu plano e encontre apoio prático para organizar escolhas e substituições.' },
  { icon: 'progress', title: 'Evolução', description: 'Registre seu peso e acompanhe seu histórico com uma visão simples da sua trajetória.' },
] as const

const faqItems = [
  { question: 'O que é a Alyvora?', answer: 'A Alyvora é uma ferramenta de organização e apoio alimentar. Ela reúne plano, registros, assistente e acompanhamento para deixar sua rotina mais clara.' },
  { question: 'Como funciona o plano alimentar?', answer: 'Você informa seu objetivo, rotina, preferências, restrições, quantidade de refeições e orçamento. Quando solicitado, a Alyvora usa esse contexto para gerar um plano personalizado de sete dias com preparos e lista de compras.' },
  { question: 'Como funciona a análise de foto?', answer: 'Você envia a imagem de uma refeição e recebe uma estimativa visual dos alimentos e valores nutricionais. Antes de registrar, é necessário revisar e confirmar as informações; a foto não garante precisão de porções ou ingredientes.' },
  { question: 'A Alyvora substitui nutricionista?', answer: 'Não. A Alyvora auxilia na organização alimentar e não realiza diagnóstico, tratamento ou prescrição clínica. Para orientação individual, procure um nutricionista ou profissional de saúde.' },
  { question: 'Como funciona o Premium?', answer: 'O Premium libera novas gerações durante a assinatura e dá acesso aos recursos Premium disponíveis. Os planos Mensal, Trimestral e Anual oferecem o mesmo acesso; o checkout seguro aparece no fluxo autenticado.' },
  { question: 'Posso usar no celular?', answer: 'Sim. A experiência web é responsiva e pode ser acessada pelo navegador do celular, tablet ou computador.' },
] as const

type IconName = 'leaf' | 'plan' | 'camera' | 'assistant' | 'progress' | 'check' | 'basket' | 'routine'

function LandingIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    {name === 'leaf' && <><path d="M26 5C14 5 7 10 7 20c0 4 2 7 5 8 1-9 6-14 14-18-6 5-10 10-12 18 8-1 13-8 12-23Z"/></>}
    {name === 'plan' && <><rect x="7" y="6" width="18" height="21" rx="3"/><path d="M11 4v5m10-5v5M11 14h10m-10 5h7m-7 5h4"/></>}
    {name === 'camera' && <><path d="M5 11h5l2-3h8l2 3h5v15H5z"/><circle cx="16" cy="18" r="5"/></>}
    {name === 'assistant' && <><path d="M7 7h18v14H14l-6 5v-5H7z"/><path d="M12 14h8m-8 4h5"/></>}
    {name === 'progress' && <><path d="M6 26V7m0 19h21"/><path d="m10 21 5-6 4 3 7-9"/><circle cx="26" cy="9" r="2"/></>}
    {name === 'check' && <><circle cx="16" cy="16" r="11"/><path d="m10 16 4 4 8-9"/></>}
    {name === 'basket' && <><path d="m7 13 2 13h14l2-13H7Z"/><path d="m11 13 5-8 5 8M5 13h22"/></>}
    {name === 'routine' && <><circle cx="16" cy="16" r="11"/><path d="M16 9v8l5 3"/></>}
  </svg>
}

function HeroFoodDecor() {
  return <div className="public-hero-food" aria-hidden="true">
    <span className="public-hero-food__crop public-hero-food__crop--tomato" data-required-asset="tomato-transparent"><img src={tomatoDecor} alt="" draggable="false"/></span>
    <span className="public-hero-food__crop public-hero-food__crop--leaf public-hero-food__crop--leaf-top" data-required-asset="green-leaf-transparent"><img src={leafDecor} alt="" draggable="false"/></span>
    <span className="public-hero-food__crop public-hero-food__crop--leaf public-hero-food__crop--leaf-bottom" data-required-asset="green-leaf-transparent"><img src={leafDecor} alt="" draggable="false"/></span>
    <span className="public-hero-food__crop public-hero-food__crop--avocado" data-required-asset="avocado-transparent"><img src={avocadoDecor} alt="" draggable="false"/></span>
  </div>
}

function LandingHeader({ onLogin, onStart }: Pick<Props, 'onLogin' | 'onStart'>) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const close = () => setOpen(false)

  return <header className="public-header">
    <div className="public-header__inner">
      <a className="public-header__brand" href="#inicio" aria-label="Alyvora, início" onClick={close}><BrandLogo/></a>
      <nav className="public-header__nav" aria-label="Navegação principal">
        {publicLinks.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
      </nav>
      <div className="public-header__actions">
        <button className="public-header__login" type="button" onClick={onLogin}>Entrar</button>
        <Button className="public-header__cta" onClick={onStart}>Começar agora <span aria-hidden="true">→</span></Button>
      </div>
      <button className="public-menu-button" type="button" aria-expanded={open} aria-controls={menuId} aria-label={open ? 'Fechar menu' : 'Abrir menu'} onClick={() => setOpen((value) => !value)}>
        <span/><span/><span/>
      </button>
      <div className="public-mobile-menu" id={menuId} hidden={!open}>
        <nav aria-label="Navegação móvel">
          {publicLinks.map(([label, href]) => <a href={href} key={href} onClick={close}>{label}</a>)}
        </nav>
        <button type="button" onClick={() => { close(); onLogin() }}>Entrar</button>
        <Button fullWidth onClick={() => { close(); onStart() }}>Começar agora</Button>
      </div>
    </div>
  </header>
}

function Faq() {
  const [openItem, setOpenItem] = useState<number | null>(0)
  const groupId = useId()

  return <section className="public-section public-faq" id="faq" aria-labelledby="public-faq-title">
    <div className="public-section-heading public-section-heading--split">
      <div><p className="public-eyebrow">Dúvidas frequentes</p><h2 id="public-faq-title">Informação clara<br/>antes de começar.</h2></div>
      <p>Entenda como a Alyvora apoia sua organização e quais são os limites da ferramenta.</p>
    </div>
    <div className="public-faq__list">
      {faqItems.map((item, index) => {
        const isOpen = openItem === index
        const panelId = `${groupId}-panel-${index}`
        const buttonId = `${groupId}-button-${index}`
        return <article className="public-faq__item" key={item.question}>
          <h3><button id={buttonId} type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenItem(isOpen ? null : index)}><span>{item.question}</span><b aria-hidden="true">{isOpen ? '−' : '+'}</b></button></h3>
          <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen}><p>{item.answer}</p></div>
        </article>
      })}
    </div>
  </section>
}

export function LandingPage({ onLogin, onRegister, onStart }: Props) {
  return <div className="public-landing" id="inicio">
    <LandingHeader onLogin={onLogin} onStart={onStart}/>
    <main>
      <section className="public-hero" aria-labelledby="public-hero-title">
        <HeroFoodDecor/>
        <div className="public-hero__copy">
          <div className="public-hero__tag"><LandingIcon name="leaf"/> Alimentação inteligente, na sua rotina</div>
          <h1 id="public-hero-title">Sua alimentação<br/><em>cabe na sua vida.</em></h1>
          <p>Organize suas refeições, tenha um plano personalizado com IA e receba orientação prática para seus objetivos.</p>
          <div className="public-hero__actions">
            <Button className="public-hero__primary" onClick={onStart}>Começar agora <span aria-hidden="true">→</span></Button>
            <a className="public-link-button" href="#como-funciona">Ver como funciona <span aria-hidden="true">↓</span></a>
          </div>
          <ul className="public-hero__benefits" aria-label="Benefícios da Alyvora">
            <li><LandingIcon name="plan"/><span>Plano alimentar<strong>personalizado</strong></span></li>
            <li><LandingIcon name="assistant"/><span>IA que entende<strong>sua rotina</strong></span></li>
            <li><LandingIcon name="routine"/><span>Organização prática<strong>para o dia a dia</strong></span></li>
          </ul>
          <p className="public-hero__note">Comece com gerações gratuitas. Sem pagamento para criar sua conta.</p>
        </div>
        <PhoneShowcase/>
      </section>

      <section className="public-section public-features" id="funcionalidades" aria-labelledby="public-features-title">
        <div className="public-section-heading public-section-heading--split">
          <div><p className="public-eyebrow">Funcionalidades</p><h2 id="public-features-title">Tudo o que você precisa<br/>em um só lugar.</h2></div>
          <p>Do planejamento ao registro da refeição, com apoio para acompanhar sua rotina sem complicação.</p>
        </div>
        <div className="public-feature-grid">
          {features.map((feature, index) => <article className={`public-feature public-feature--${index + 1}`} key={feature.title}>
            <span className="public-feature__icon"><LandingIcon name={feature.icon}/></span>
            <span className="public-feature__number">0{index + 1}</span>
            <h3>{feature.title}</h3><p>{feature.description}</p>
            {feature.icon === 'camera' && <div className="public-feature__photo"><img src={mealPhoto} alt="Prato colorido com frango, grãos e vegetais" loading="lazy"/></div>}
            {feature.icon === 'progress' && <div className="public-feature__chart" aria-hidden="true"><i/><i/><i/><i/><i/></div>}
            {feature.icon === 'assistant' && <div className="public-feature__message" aria-hidden="true">Como posso organizar meu jantar hoje?</div>}
            {feature.icon === 'plan' && <div className="public-feature__week" aria-hidden="true"><b>Seg</b><span>Ter</span><span>Qua</span><span>Qui</span></div>}
          </article>)}
        </div>
      </section>

      <section className="public-how" id="como-funciona" aria-labelledby="public-how-title">
        <div className="public-section public-how__inner">
          <div className="public-how__intro"><p className="public-eyebrow">Como funciona</p><h2 id="public-how-title">Simples, prático e feito para a sua rotina.</h2><p>Comece com suas informações e transforme decisões soltas em uma semana mais organizada.</p><Button onClick={onStart}>Quero começar <span aria-hidden="true">→</span></Button></div>
          <ol className="public-how__steps">
            <li><span>1</span><div><h3>Conte sobre sua rotina</h3><p>Objetivos, preferências, restrições e horários ajudam a criar contexto.</p></div></li>
            <li><span>2</span><div><h3>Receba seu plano</h3><p>Tenha sete dias de refeições, preparos e lista de compras organizados.</p></div></li>
            <li><span>3</span><div><h3>Acompanhe e ajuste</h3><p>Registre refeições, converse com o assistente e acompanhe sua evolução.</p></div></li>
          </ol>
        </div>
      </section>

      <section className="public-section public-demo" aria-labelledby="public-demo-title">
        <div className="public-section-heading">
          <p className="public-eyebrow">Veja na prática</p><h2 id="public-demo-title">Uma experiência conectada<br/>do plano ao acompanhamento.</h2><p>As ferramentas se complementam para apoiar a organização da sua alimentação.</p>
        </div>
        <div className="public-demo__grid">
          <article><div className="public-demo__screen public-demo__screen--day"><span>Hoje</span><h3>Meu dia</h3><div><b>1.250</b><small>kcal registradas</small></div><ul><li>✓ Café da manhã</li><li>✓ Almoço</li><li>○ Lanche da tarde</li></ul></div><h3>Acompanhe seu plano</h3><p>Consulte refeições e preparos em uma visão simples do dia.</p></article>
          <article><div className="public-demo__screen public-demo__screen--photo"><img src={mealPhoto} alt="Refeição pronta para análise" loading="lazy"/><span aria-hidden="true">◎</span></div><h3>Registre com uma foto</h3><p>Receba uma estimativa para revisar antes de adicionar ao seu dia.</p></article>
          <article><div className="public-demo__screen public-demo__screen--assistant"><span>Você</span><p>O que posso preparar para o jantar?</p><span>Alyvora</span><p>Vamos pensar em uma opção que combine com seu plano e sua rotina.</p></div><h3>Converse com o assistente</h3><p>Use o contexto do seu plano para organizar escolhas práticas.</p></article>
          <article><div className="public-demo__screen public-demo__screen--evolution"><h3>Evolução</h3><div aria-hidden="true"><i/><i/><i/><i/><i/><i/></div><strong>Seu histórico, com clareza.</strong></div><h3>Observe sua evolução</h3><p>Acompanhe registros ao longo do tempo, sem promessas irreais.</p></article>
        </div>
      </section>

      <section className="public-benefits" aria-labelledby="public-benefits-title">
        <div className="public-section public-benefits__inner">
          <div><p className="public-eyebrow">Feito para a vida real</p><h2 id="public-benefits-title">Mais organização.<br/>Menos decisões soltas.</h2></div>
          <ul>
            <li><LandingIcon name="routine"/><div><strong>Praticidade</strong><span>Informações reunidas em um só fluxo.</span></div></li>
            <li><LandingIcon name="plan"/><div><strong>Personalização</strong><span>Contexto da sua rotina orientando o plano.</span></div></li>
            <li><LandingIcon name="basket"/><div><strong>Organização</strong><span>Refeições e compras mais fáceis de consultar.</span></div></li>
            <li><LandingIcon name="progress"/><div><strong>Acompanhamento</strong><span>Registros para observar sua trajetória.</span></div></li>
          </ul>
        </div>
      </section>

      <section className="public-section public-pricing" id="planos" aria-labelledby="public-pricing-title">
        <div className="public-section-heading public-section-heading--split">
          <div><p className="public-eyebrow">Planos</p><h2 id="public-pricing-title">Escolha o período<br/>que combina com você.</h2></div>
          <p>Todos os períodos oferecem o mesmo acesso Premium. O checkout seguro é apresentado somente depois que você entra na sua conta.</p>
        </div>
        <div className="public-pricing__grid">
          {subscriptionPlans.map((plan) => <article className="public-plan" key={plan.code}>
            <span>{plan.shortName}</span><h3>{plan.name}</h3>
            <p className="public-plan__price"><strong>{plan.price}</strong><small>{plan.period}</small></p>
            <p>{plan.equivalent}</p>
            <ul>{premiumFeatures.map((feature) => <li key={feature}><LandingIcon name="check"/>{feature}</li>)}</ul>
            <Button variant="secondary" fullWidth onClick={onRegister}>Criar conta</Button>
          </article>)}
        </div>
        <p className="public-pricing__note">Você pode começar com gerações gratuitas. Nenhum pagamento é realizado nesta página.</p>
      </section>

      <Faq/>

      <section className="public-final-cta" aria-labelledby="public-final-title">
        <div className="public-final-cta__leaf public-final-cta__leaf--left" aria-hidden="true"/>
        <div><p className="public-eyebrow">No seu ritmo</p><h2 id="public-final-title">Comece a organizar sua alimentação de um jeito que cabe na sua rotina.</h2><p>Reúna seu planejamento, seus registros e seu acompanhamento em uma experiência simples.</p></div>
        <Button onClick={onStart}>Começar agora <span aria-hidden="true">→</span></Button>
        <div className="public-final-cta__leaf public-final-cta__leaf--right" aria-hidden="true"/>
      </section>
    </main>

    <footer className="public-footer">
      <div className="public-footer__main">
        <a href="#inicio" aria-label="Alyvora, voltar ao início"><BrandLogo/></a>
        <nav aria-label="Navegação do rodapé">{publicLinks.map(([label, href]) => <a href={href} key={href}>{label}</a>)}</nav>
        <div><button type="button" onClick={onLogin}>Entrar</button><button type="button" onClick={onStart}>Começar agora</button></div>
      </div>
      <div className="public-footer__bottom"><p>A Alyvora auxilia na organização alimentar e não substitui orientação de nutricionista ou profissional de saúde.</p><p>© {new Date().getFullYear()} Alyvora.</p></div>
    </footer>
  </div>
}
