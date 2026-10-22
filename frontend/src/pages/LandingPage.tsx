import { useEffect, useId, useState, type CSSProperties } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { DecorHerb, DecorLeaf, DecorLemon, DecorSeeds, DecorSprig, DecorStem, DecorWave } from '../components/landing/LandingDecor'
import { PhoneShowcase } from '../components/landing/PhoneShowcase'
import { PriceStatement } from '../components/landing/PriceStatement'
import { revealDelay, useRevealOnScroll } from '../components/landing/useRevealOnScroll'
import { Button } from '../components/ui/Button'
import mealPhoto from '../assets/landing/differentials-food-photo.webp'
import { premiumFeatures, subscriptionPlans } from '../data/subscriptionPlans'
import './LandingPage.css'

interface Props { onLogin(): void; onRegister(): void; onStart(): void }

/** Staggered entrance for sibling cards (see useRevealOnScroll). */
const revealStyle = (index: number) => ({ '--reveal-delay': revealDelay(index) }) as CSSProperties

const publicLinks = [
  ['Início', '#inicio'],
  ['Funcionalidades', '#funcionalidades'],
  ['Como funciona', '#como-funciona'],
  ['Planos', '#planos'],
  ['FAQ', '#faq'],
] as const

const features = [
  { icon: 'plan', title: 'Plano alimentar personalizado', description: 'Sete dias de refeições montados com o que você gosta, sem o que você não come e dentro do que você quer gastar no mercado.' },
  { icon: 'camera', title: 'Foto do prato', description: 'Fotografe o almoço e veja uma estimativa do que tem no prato. Você corrige o que precisar antes de salvar.' },
  { icon: 'assistant', title: 'Assistente', description: 'Acabou o frango? Pergunte o que colocar no lugar e receba uma resposta curta, que conhece o seu plano.' },
  { icon: 'progress', title: 'Evolução', description: 'Anote seu peso quando quiser e veja no gráfico como ele muda ao longo das semanas.' },
] as const

const faqItems = [
  { question: 'O que é a Alyvora?', answer: 'Um app que monta seu cardápio da semana com IA, a partir do que você gosta, do que não come e do seu orçamento. Também tem diário com foto do prato, um assistente para tirar dúvidas e um lugar para anotar seu peso.' },
  { question: 'Como funciona o plano alimentar?', answer: 'Você conta seu objetivo, quantas refeições faz por dia, o que não come, se tem alergia e quanto quer gastar por semana. Quando você pedir, a Alyvora monta sete dias de refeições com preparo e lista de compras. Algo como: “Segunda: tapioca com ovo no café, frango com arroz e feijão no almoço — R$ 31 no dia”.' },
  { question: 'Como funciona a análise de foto?', answer: 'Você fotografa o prato e a Alyvora estima os alimentos, as porções e as calorias. É uma estimativa: você confere, corrige o que estiver errado e só então salva no diário.' },
  { question: 'A Alyvora substitui nutricionista?', answer: 'Não. A Alyvora ajuda no dia a dia, mas não faz diagnóstico nem prescreve dieta. Se você tem alguma condição de saúde ou precisa de acompanhamento, procure um nutricionista.' },
  { question: 'Como funciona o Premium?', answer: 'Com o Premium você gera planos novos enquanto a assinatura estiver ativa e usa o assistente e a foto do prato. Mensal, trimestral ou anual: o acesso é o mesmo, muda só o período. O pagamento é feito depois que você entra na conta.' },
  { question: 'Posso usar no celular?', answer: 'Pode. Funciona no navegador do celular, do tablet ou do computador, sem instalar nada.' },
] as const

// An illustrative day, shown as such on the page: the numbers add up (380 + 650 + 280 + 640 = 1.950 kcal).
const sampleMeals = [
  { time: '07:30', name: 'Café da manhã', foods: 'Tapioca com ovo mexido e queijo minas, café', kcal: 380 },
  { time: '12:30', name: 'Almoço', foods: 'Arroz, feijão, frango grelhado e salada de tomate', kcal: 650 },
  { time: '16:00', name: 'Lanche', foods: 'Iogurte natural com banana e aveia', kcal: 280 },
  { time: '20:00', name: 'Jantar', foods: 'Patinho moído com mandioca e abobrinha', kcal: 640 },
] as const

const sampleShopping = [
  { category: 'Hortifruti', items: [['Tomate', '1 kg', true], ['Banana', '1 dúzia', true], ['Abobrinha', '2 un.', false]] },
  { category: 'Açougue', items: [['Peito de frango', '1,2 kg', true], ['Patinho moído', '800 g', false]] },
  { category: 'Mercearia', items: [['Feijão carioca', '1 kg', false], ['Goma de tapioca', '500 g', false]] },
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
  // Light hand-drawn decor only; the fruits moved to the price section below, where they slide in on scroll.
  return <div className="public-hero-food" aria-hidden="true">
    <DecorLeaf className="public-hero-decor public-hero-decor--leaf-top"/>
    <DecorSeeds className="public-hero-decor public-hero-decor--seeds"/>
    <DecorSprig className="public-hero-decor public-hero-decor--sprig"/>
    <DecorLeaf className="public-hero-decor public-hero-decor--leaf-low"/>
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
      <div><p className="public-eyebrow">Dúvidas frequentes</p><h2 id="public-faq-title">Antes de você<br/>começar.</h2></div>
      <p>O que a Alyvora faz, como funciona a foto do prato e quanto custa.</p>
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

/** Scrolls to the section in the URL hash; the browser tries before React has rendered the page. */
function scrollToHashSection() {
  let id = ''
  try { id = decodeURIComponent(window.location.hash.slice(1)) } catch { return }
  if (id) document.getElementById(id)?.scrollIntoView()
}

export function LandingPage({ onLogin, onRegister, onStart }: Props) {
  const revealRoot = useRevealOnScroll<HTMLDivElement>()
  // Runs after the reveal hook's effect, whose on-screen check waits a frame and so sees the new position.
  useEffect(scrollToHashSection, [])
  return <div className="public-landing" id="inicio" ref={revealRoot}>
    <LandingHeader onLogin={onLogin} onStart={onStart}/>
    <main>
      <section className="public-hero" aria-labelledby="public-hero-title">
        <HeroFoodDecor/>
        <div className="public-hero__copy">
          <div className="public-hero__tag"><LandingIcon name="leaf"/> Cardápio da semana com lista de compras</div>
          <h1 id="public-hero-title">Sua alimentação<br/><em>cabe na sua <span className="public-hero__mark">vida.<svg className="public-hero__underline" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M3 11c38-7 92-9 194-4"/></svg></span></em></h1>
          <p>Você conta o que gosta, o que não come e quanto pode gastar. A Alyvora monta a semana inteira: café, almoço, jantar e a lista do mercado.</p>
          <div className="public-hero__actions">
            <Button className="public-hero__primary" onClick={onStart}>Começar agora <span aria-hidden="true">→</span></Button>
            <a className="public-link-button" href="#como-funciona">Ver como funciona <span aria-hidden="true">↓</span></a>
          </div>
          <ul className="public-hero__benefits" aria-label="Benefícios da Alyvora">
            <li><LandingIcon name="plan"/><span>7 dias de refeições<strong>com preparo</strong></span></li>
            <li><LandingIcon name="basket"/><span>Lista de compras<strong>por categoria</strong></span></li>
            <li><LandingIcon name="routine"/><span>Custo estimado<strong>por dia e semana</strong></span></li>
          </ul>
          <p className="public-hero__note">Os 3 primeiros cardápios são grátis. Não pedimos cartão para criar a conta.</p>
        </div>
        <PhoneShowcase/>
      </section>

      <PriceStatement/>

      <section className="public-section public-features" id="funcionalidades" aria-labelledby="public-features-title">
        <div className="public-section-heading public-section-heading--split">
          <div data-reveal><p className="public-eyebrow">Funcionalidades</p><h2 id="public-features-title">Do cardápio à lista<br/>do mercado.</h2></div>
          <p>Você planeja a semana, fotografa o que comeu, tira dúvidas e anota o peso, tudo no mesmo app.</p>
        </div>
        <div className="public-feature-grid">
          {features.map((feature, index) => <article className={`public-feature public-feature--${index + 1}`} key={feature.title} data-reveal style={revealStyle(index)}>
            <span className="public-feature__icon"><LandingIcon name={feature.icon}/></span>
            <span className="public-feature__number">0{index + 1}</span>
            <h3>{feature.title}</h3><p>{feature.description}</p>
            {feature.icon === 'camera' && <div className="public-feature__photo"><img src={mealPhoto} alt="Prato colorido com frango, grãos e vegetais" loading="lazy"/></div>}
            {feature.icon === 'progress' && <div className="public-feature__chart" aria-hidden="true"><i/><i/><i/><i/><i/></div>}
            {feature.icon === 'assistant' && <div className="public-feature__message" aria-hidden="true">Tenho ovo e abobrinha. O que faço pro jantar?</div>}
            {feature.icon === 'plan' && <div className="public-feature__week" aria-hidden="true"><b>Seg</b><span>Ter</span><span>Qua</span><span>Qui</span></div>}
          </article>)}
        </div>
      </section>

      <section className="public-how" id="como-funciona" aria-labelledby="public-how-title">
        <DecorWave className="public-how__wave"/>
        <DecorLeaf className="public-section-decor public-section-decor--how"/>
        <DecorSeeds className="public-section-decor public-section-decor--how-seeds"/>
        <div className="public-section public-how__inner">
          <div className="public-how__intro"><div data-reveal><p className="public-eyebrow">Como funciona</p><h2 id="public-how-title">Cinco perguntas e você já vê sua segunda-feira.</h2></div><p>Depois é só abrir o app na hora de cozinhar ou de ir ao mercado.</p><Button className="landing-cta-button" onClick={onStart}>Quero começar <span className="landing-cta-button__arrow" aria-hidden="true">→</span></Button></div>
          <div className="public-how__steps-wrap">
          <DecorStem className="public-how__stem"/>
          <ol className="public-how__steps">
            <li data-reveal style={revealStyle(0)}><span className="public-how__number" aria-hidden="true">01</span><div><h3>Conte como você come</h3><p>Seu objetivo, o que você não come de jeito nenhum, alergias e quanto quer gastar por semana.</p></div><DecorLeaf className="public-how__stem-leaf"/></li>
            <li data-reveal style={revealStyle(1)}><span className="public-how__number" aria-hidden="true">02</span><div><h3>Receba a semana pronta</h3><p>Sete dias de refeições com quantidades, modo de preparo e a lista do mercado separada por categoria.</p></div><DecorLeaf className="public-how__stem-leaf public-how__stem-leaf--mirror"/></li>
            <li data-reveal style={revealStyle(2)}><span className="public-how__number" aria-hidden="true">03</span><div><h3>Ajuste no caminho</h3><p>Fotografe o que comeu, pergunte ao assistente quando quiser trocar algo e anote seu peso.</p></div></li>
          </ol>
          </div>
        </div>
        <DecorWave className="public-how__wave" flip/>
      </section>

      <section className="public-section public-sample" aria-labelledby="public-sample-title">
        <div className="public-section-heading public-section-heading--split">
          <div data-reveal><p className="public-eyebrow">Um dia de exemplo</p><h2 id="public-sample-title">Segunda-feira,<br/>do café ao jantar.</h2></div>
          <p>É assim que o plano chega: horário, o que comer, calorias e quanto custa. Este é só um exemplo; o seu é montado com o que você gosta e com o seu orçamento.</p>
        </div>
        <div className="public-sample__grid">
          <article className="public-sample__day" aria-label="Exemplo de um dia do plano" data-reveal style={revealStyle(0)}>
            <header><span>Segunda-feira</span><small>Exemplo</small></header>
            <ol>{sampleMeals.map((meal, index) => <li key={meal.name} style={{ '--i': index } as CSSProperties}>
              <time>{meal.time}</time>
              <div><strong>{meal.name}</strong><span>{meal.foods}</span></div>
              <b>{meal.kcal} kcal</b>
            </li>)}</ol>
            <footer><span><strong>1.950</strong> kcal no dia</span><span><strong>R$ 31</strong> no dia</span></footer>
          </article>
          <article className="public-sample__list" aria-label="Exemplo da lista de compras da semana" data-reveal style={revealStyle(1)}>
            <header><LandingIcon name="basket"/><div><strong>Lista de compras</strong><small>Semana inteira, por categoria</small></div></header>
            {sampleShopping.map((group, groupIndex) => <section key={group.category}>
              <h3>{group.category}</h3>
              <ul>{group.items.map(([name, amount, done], index) => <li key={name} className={done ? 'is-done' : undefined} style={{ '--i': groupIndex * 3 + index } as CSSProperties}>
                <span className="public-sample__check" aria-hidden="true"/>
                <span className="public-sample__item">{name}</span><small>{amount}</small>
                {done && <span className="ui-visually-hidden"> (já comprado)</span>}
              </li>)}</ul>
            </section>)}
            <footer>Estimativa da semana: <strong>R$ 217</strong></footer>
          </article>
        </div>
      </section>

      <section className="public-section public-demo" aria-labelledby="public-demo-title">
        <DecorHerb className="public-section-decor public-section-decor--demo"/>
        <div className="public-section-heading">
          <div data-reveal><p className="public-eyebrow">Veja na prática</p><h2 id="public-demo-title">Como fica<br/>num dia comum.</h2></div><p>Do café da manhã ao jantar, com a Alyvora aberta no celular.</p>
        </div>
        <div className="public-demo__grid">
          <article data-reveal style={revealStyle(0)}><div className="public-demo__screen public-demo__screen--day"><span>Hoje</span><h3>Meu dia</h3><div><b>1.250</b><small>kcal registradas</small></div><ul><li>✓ Café da manhã</li><li>✓ Almoço</li><li>○ Lanche da tarde</li></ul></div><h3>Veja o que tem para hoje</h3><p>Abra o dia e veja o que comer em cada refeição, com o preparo logo abaixo.</p></article>
          <article data-reveal style={revealStyle(1)}><div className="public-demo__screen public-demo__screen--photo"><img src={mealPhoto} alt="Refeição pronta para análise" loading="lazy"/><span aria-hidden="true">◎</span></div><h3>Fotografe o prato</h3><p>A Alyvora estima o que tem ali. Você confere e salva no diário.</p></article>
          <article data-reveal style={revealStyle(2)}><div className="public-demo__screen public-demo__screen--assistant"><span>Você</span><p>Só tenho ovo, tomate e arroz. O que faço pro jantar?</p><span>Alyvora</span><p>Um mexido de ovo com tomate por cima do arroz. Fica pronto em 10 minutos e não foge do seu plano.</p></div><h3>Pergunte o que quiser</h3><p>O assistente conhece o seu plano e responde curto, sem sermão.</p></article>
          <article data-reveal style={revealStyle(3)}><div className="public-demo__screen public-demo__screen--evolution"><h3>Evolução</h3><div aria-hidden="true"><i/><i/><i/><i/><i/><i/></div><strong>Seu peso, semana a semana.</strong></div><h3>Acompanhe seu peso</h3><p>Anote quando quiser e veja a linha do gráfico se mexer.</p></article>
        </div>
      </section>

      <section className="public-benefits" aria-labelledby="public-benefits-title">
        <DecorWave className="public-benefits__wave"/>
        <div className="public-section public-benefits__inner">
          <div className="public-benefits__heading" data-reveal><DecorLemon className="public-benefits__lemon"/><DecorSeeds className="public-benefits__seeds"/><p className="public-eyebrow">Feito para a vida real</p><h2 id="public-benefits-title">Menos “o que eu<br/>como hoje?”</h2></div>
          <ul>
            <li data-reveal style={revealStyle(0)}><LandingIcon name="routine"/><div><strong>Sem decidir na hora</strong><span>O cardápio já está pronto quando bate a fome.</span></div></li>
            <li data-reveal style={revealStyle(1)}><LandingIcon name="plan"/><div><strong>Do seu jeito</strong><span>Não come peixe? Peixe não entra. Alergias são a primeira regra do plano.</span></div></li>
            <li data-reveal style={revealStyle(2)}><LandingIcon name="basket"/><div><strong>Dentro do orçamento</strong><span>Cada dia vem com o custo estimado, para você saber quanto vai gastar.</span></div></li>
            <li data-reveal style={revealStyle(3)}><LandingIcon name="progress"/><div><strong>Tudo guardado</strong><span>Refeições e pesos anotados ficam salvos para você comparar.</span></div></li>
          </ul>
        </div>
        <DecorWave className="public-benefits__wave" flip/>
      </section>

      <section className="public-section public-pricing" id="planos" aria-labelledby="public-pricing-title">
        <div className="public-section-heading public-section-heading--split">
          <div data-reveal><p className="public-eyebrow">Planos</p><h2 id="public-pricing-title">Mesmo acesso,<br/>você escolhe o período.</h2></div>
          <p>Os três planos liberam as mesmas coisas; muda só por quanto tempo você paga. O pagamento só acontece depois que você entra na sua conta.</p>
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
        <p className="public-pricing__note">Dá para testar com 3 cardápios grátis antes de decidir. Nada é cobrado nesta página.</p>
      </section>

      <Faq/>

      <section className="public-final-cta" aria-labelledby="public-final-title" data-reveal>
        <DecorLeaf className="public-final-cta__leaf public-final-cta__leaf--left"/>
        <DecorSprig className="public-final-cta__leaf public-final-cta__sprig"/>
        <div><p className="public-eyebrow">No seu ritmo</p><h2 id="public-final-title">Monte sua primeira semana hoje.</h2><p>Responda cinco perguntas e veja sua segunda-feira na hora, antes de criar conta. A semana inteira sai grátis com a sua conta.</p></div>
        <Button className="landing-cta-button" onClick={onStart}>Começar agora <span className="landing-cta-button__arrow" aria-hidden="true">→</span></Button>
        <DecorLeaf className="public-final-cta__leaf public-final-cta__leaf--right"/>
      </section>
    </main>

    <footer className="public-footer">
      <div className="public-footer__main">
        <a href="#inicio" aria-label="Alyvora, voltar ao início"><BrandLogo/></a>
        <nav aria-label="Navegação do rodapé">{publicLinks.map(([label, href]) => <a href={href} key={href}>{label}</a>)}</nav>
        <div><button type="button" onClick={onLogin}>Entrar</button><button type="button" onClick={onStart}>Começar agora</button></div>
      </div>
      <div className="public-footer__bottom"><p>A Alyvora dá sugestões gerais de alimentação e não substitui orientação de nutricionista ou profissional de saúde.</p><p>© {new Date().getFullYear()} Alyvora.</p></div>
    </footer>
  </div>
}
