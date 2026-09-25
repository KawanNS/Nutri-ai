import { BrandLogo } from '../components/BrandLogo'
import heroFoodPhoto from '../assets/landing/hero-food-photo.png'
import differentialsFoodPhoto from '../assets/landing/differentials-food-photo.png'
import { premiumFeatures, subscriptionPlans } from '../data/subscriptionPlans'

interface Props { onLogin(): void; onRegister(): void; onStart(): void }

const publicLinks = [
  ['Início', '#inicio'],
  ['Como funciona', '#como-funciona'],
  ['Recursos', '#recursos'],
  ['Planos', '#planos'],
  ['Depoimentos', '#depoimentos'],
  ['FAQ', '#faq'],
] as const

const faqItems = [
  {
    question: 'O que é o Nutri-AI?',
    answer: 'É uma ferramenta de apoio à organização alimentar. A partir das informações do seu perfil, o Nutri-AI estrutura um planejamento de sete dias com refeições, preparos, estimativas e lista de compras.',
  },
  {
    question: 'Como o planejamento é criado?',
    answer: 'Você informa objetivo, rotina de atividade, quantidade de refeições, orçamento, preferências e restrições. A IA usa esses dados para gerar um plano de sete dias, que só é criado quando você solicita.',
  },
  {
    question: 'Como funcionam as três gerações gratuitas?',
    answer: 'A conta começa com três gerações disponíveis. Cada novo planejamento concluído utiliza uma delas; tentativas que falham não são tratadas como uma geração concluída.',
  },
  {
    question: 'O que acontece quando os usos gratuitos terminam?',
    answer: 'Os planejamentos anteriores continuam disponíveis. Para criar um novo planejamento, o produto apresenta as opções Premium no fluxo autenticado.',
  },
  {
    question: 'O que está incluído no Premium?',
    answer: 'A assinatura libera novas gerações durante o período ativo. Cada plano gerado inclui sete dias personalizados, refeições e preparos, estimativas nutricionais e de custo, além da lista de compras organizada por categoria.',
  },
  {
    question: 'Como funcionam os planos Mensal, Trimestral e Anual?',
    answer: 'Os três períodos oferecem o mesmo acesso Premium. O que muda é o período e o respectivo valor exibido na seção de planos; o checkout é apresentado somente no fluxo autenticado.',
  },
  {
    question: 'Como a IA utiliza as minhas informações?',
    answer: 'Os dados do perfil são usados como contexto para montar o planejamento solicitado, respeitando alergias e restrições informadas, preferências, número de refeições e orçamento semanal.',
  },
  {
    question: 'Posso gerar novos planejamentos?',
    answer: 'Sim. Você pode solicitar um novo planejamento enquanto ainda tiver gerações gratuitas ou durante uma assinatura Premium ativa.',
  },
  {
    question: 'O Nutri-AI substitui um nutricionista?',
    answer: 'Não. O Nutri-AI ajuda a organizar informações e possibilidades alimentares. Ele não realiza diagnóstico, tratamento ou prescrição clínica e não substitui orientação individual de nutricionista ou médico.',
  },
] as const

function PublicLinks() {
  return <>{publicLinks.map(([label, href]) => <a href={href} key={href}>{label}</a>)}</>
}

type LandingIconName = 'target' | 'recipe' | 'progress' | 'spark' | 'wellbeing' | 'profile' | 'plan' | 'chart' | 'basket'

function LandingIcon({ name }: { name: LandingIconName }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    {name === 'target' && <><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="4"/><path d="m19 13 8-8m-4 0h4v4"/></>}
    {name === 'recipe' && <><path d="M9 8h14v16H9zM12 4v7m4-7v7m4-7v7"/><path d="M13 16h6m-6 4h4"/></>}
    {name === 'progress' && <><path d="M6 25V7m0 18h20"/><path d="m9 20 5-5 4 3 7-9"/></>}
    {name === 'spark' && <><path d="M16 3c.8 7.2 4.8 11.2 12 12-7.2.8-11.2 4.8-12 12-.8-7.2-4.8-11.2-12-12 7.2-.8 11.2-4.8 12-12Z"/><path d="M25 3v6m-3-3h6"/></>}
    {name === 'wellbeing' && <><path d="M16 27S5 21 5 12a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 9-11 15-11 15Z"/><path d="M11 16h3l2-5 2 9 2-4h3"/></>}
    {name === 'profile' && <><circle cx="16" cy="10" r="5"/><path d="M7 27c.5-6 3.5-9 9-9s8.5 3 9 9"/></>}
    {name === 'plan' && <><path d="M8 5h16v22H8z"/><path d="M12 3v5m8-5v5M8 11h16m-12 5h8m-8 5h6"/></>}
    {name === 'chart' && <><path d="M6 25V7m0 18h20"/><path d="m9 20 5-5 4 3 7-9"/><circle cx="25" cy="9" r="2"/></>}
    {name === 'basket' && <><path d="m7 13 2 13h14l2-13H7Z"/><path d="m11 13 5-8 5 8M5 13h22m-15 4v5m4-5v5m4-5v5"/></>}
  </svg>
}

export function LandingPage({ onLogin, onRegister, onStart }: Props) {
  return <div className="landing" id="inicio">
    <header className="landing-header">
      <div className="landing-nav">
        <a className="landing-wordmark" href="#inicio" aria-label="Nutri-AI, início">
          <BrandLogo className="landing-brand-logo"/>
        </a>
        <nav className="landing-nav__links" aria-label="Navegação pública"><PublicLinks /></nav>
        <div className="landing-nav__actions">
          <button className="landing-text-button" type="button" onClick={onLogin}>Entrar</button>
          <button className="landing-button landing-button--primary landing-button--header" type="button" onClick={onStart}>Começar grátis</button>
        </div>
        <details className="landing-menu">
          <summary>Menu</summary>
          <nav aria-label="Navegação pública móvel"><PublicLinks /><button type="button" onClick={onLogin}>Entrar</button></nav>
        </details>
      </div>
    </header>

    <main>
      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero__copy">
          <p className="landing-handwritten landing-hero__note">Mais saúde para a sua rotina.</p>
          <h1 id="landing-hero-title"><span>Comer bem</span><span>pode ser mais</span><em>simples.</em></h1>
          <p className="landing-hero__lead">O Nutri-AI transforma seus objetivos, sua rotina e seu orçamento em um plano alimentar possível — com sete dias organizados, lista de compras e acompanhamento da sua evolução.</p>
          <div className="landing-actions">
            <button className="landing-button landing-button--primary" type="button" onClick={onStart}>Começar grátis</button>
            <a className="landing-button landing-button--secondary" href="#como-funciona">Ver como funciona <span aria-hidden="true">↓</span></a>
          </div>
          <ul className="landing-trust" aria-label="Vantagens para começar">
            <li>Três gerações gratuitas</li>
            <li>Comece sem cadastro ou cartão</li>
            <li>Feito para a sua rotina</li>
          </ul>
        </div>

        <div className="landing-hero-art" aria-label="Prévia ilustrativa do Nutri-AI organizando uma rotina alimentar">
          <div className="landing-hero-art__photo" data-asset-slot="HERO_FOOD_PHOTO" aria-hidden="true">
            <img src={heroFoodPhoto} alt=""/>
          </div>
          <div className="landing-hero-art__halo" aria-hidden="true"/>
          {/* BOTANICAL_ASSET: os recortes botânicos reais substituirão estas formas CSS. */}
          <div className="landing-botanical" data-asset-slot="BOTANICAL_ASSET" aria-hidden="true"><i/><i/><i/><i/></div>
          <div className="landing-paper-note landing-paper-note--top" aria-hidden="true">Comida boa.<br/>Vida real.</div>
          <div className="landing-paper-note landing-paper-note--bottom" aria-hidden="true">um passo<br/>de cada vez</div>

          {/* HERO_PRODUCT_SCREENSHOT: substituir o conteúdo interno por uma captura real aprovada. */}
          <div className="landing-phone" data-asset-slot="HERO_PRODUCT_SCREENSHOT">
            <div className="landing-phone__speaker" aria-hidden="true"/>
            <div className="landing-phone__screen">
              <div className="landing-phone__status" aria-hidden="true"><span>9:41</span><span>● ● ●</span></div>
              <div className="landing-phone__brand"><BrandLogo variant="symbol"/><strong>Nutri-AI</strong></div>
              <p>Seu plano alimentar</p>
              <h2>Uma semana que<br/>combina com você.</h2>
              <div className="landing-phone__days" aria-label="Dias do plano"><b>Seg</b><span>Ter</span><span>Qua</span><span>Qui</span></div>
              <article><time>08:00</time><div><small>Café da manhã</small><strong>Comece bem o dia</strong></div><i aria-hidden="true"/></article>
              <article><time>12:30</time><div><small>Almoço</small><strong>Equilíbrio no prato</strong></div><i aria-hidden="true"/></article>
              <div className="landing-phone__footer"><span>Plano</span><span>Compras</span><span>Evolução</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-benefits" aria-labelledby="landing-benefits-title">
        <div className="landing-benefits__inner">
          <p className="landing-handwritten landing-benefits__note" id="landing-benefits-title">Tudo o que ajuda<br/>a rotina a fluir.</p>
          <ul>
            <li><LandingIcon name="target"/><span>Planos personalizados</span></li>
            <li><LandingIcon name="recipe"/><span>Receitas saudáveis<br/>e saborosas</span></li>
            <li><LandingIcon name="progress"/><span>Acompanhamento<br/>de progresso</span></li>
            <li><LandingIcon name="spark"/><span>Dicas com IA</span></li>
            <li><LandingIcon name="wellbeing"/><span>Mais saúde<br/>e bem-estar</span></li>
          </ul>
        </div>
      </section>

      <section className="landing-process" id="como-funciona" aria-labelledby="landing-process-title">
        <div className="landing-process__inner">
          <header className="landing-process__heading">
            <div><p className="landing-kicker">Como funciona</p><h2 id="landing-process-title">Do seu objetivo<br/>à prática, <em>sem complicação.</em></h2></div>
            <p className="landing-handwritten">três passos.<br/>do seu jeito.</p>
          </header>
          <ol className="landing-process__steps">
            <li>
              <span className="landing-process__number">1</span>
              <LandingIcon name="profile"/>
              <div><h3>Conte seus objetivos</h3><p>Compartilhe sua rotina, preferências, restrições e orçamento para orientar o plano.</p></div>
            </li>
            <li>
              <span className="landing-process__number">2</span>
              <LandingIcon name="plan"/>
              <div><h3>Receba seu plano</h3><p>Tenha sete dias de refeições organizadas, com preparos e lista de compras.</p></div>
            </li>
            <li>
              <span className="landing-process__number">3</span>
              <LandingIcon name="chart"/>
              <div><h3>Acompanhe e evolua</h3><p>Registre seu peso e observe seu histórico para entender o que funciona para você.</p></div>
            </li>
          </ol>
        </div>
      </section>

      <section className="landing-differentials" id="recursos" aria-labelledby="landing-differentials-title">
        <div className="landing-differentials__copy">
          <p className="landing-kicker">Feito para a vida real</p>
          <h2 id="landing-differentials-title">Mais do que dietas,<br/><em>hábitos que fazem sentido.</em></h2>
          <p className="landing-differentials__lead">Organização para comer melhor sem ignorar sua rotina, suas escolhas ou quanto você pode gastar.</p>
          <ul>
            <li><span><LandingIcon name="plan"/></span><div><h3>Planos flexíveis e práticos</h3><p>Uma semana estruturada com refeições e preparos fáceis de consultar.</p></div></li>
            <li><span><LandingIcon name="basket"/></span><div><h3>Compras e orçamento organizados</h3><p>Ingredientes agrupados por categoria e custos estimados para planejar melhor.</p></div></li>
            <li><span><LandingIcon name="chart"/></span><div><h3>Evolução acompanhada</h3><p>Histórico de peso para visualizar sua trajetória com clareza.</p></div></li>
          </ul>
        </div>
        <div className="landing-differentials__visual">
          <div className="landing-differentials__photo" data-asset-slot="DIFFERENTIALS_FOOD_PHOTO">
            <img src={differentialsFoodPhoto} alt="Prato saudável com frango, folhas, tomates e vegetais"/>
          </div>
          <aside className="landing-differentials__note"><span>leve para a rotina</span><strong>escolhas possíveis,<br/>todos os dias.</strong></aside>
        </div>
      </section>

      <section className="landing-testimonials" id="depoimentos" aria-labelledby="landing-testimonials-title">
        <div className="landing-testimonials__inner">
          <header className="landing-testimonials__heading">
            <div><p className="landing-kicker">Relatos em construção</p><h2 id="landing-testimonials-title">Histórias reais,<br/><em>quando estiverem prontas.</em></h2></div>
            <p className="landing-handwritten">cada rotina<br/>tem seu ritmo.</p>
          </header>
          <aside className="landing-testimonials__disclosure"><span aria-hidden="true">Nota editorial</span><p><strong>Conteúdo demonstrativo.</strong> Estes textos mostram como os relatos serão apresentados. Nenhuma fala abaixo é atribuída a uma pessoa real.</p></aside>
          <div className="landing-testimonials__stories">
            <figure><span className="landing-testimonials__index" aria-hidden="true">01</span><blockquote>“Consigo visualizar a semana inteira antes de organizar as compras.”</blockquote><figcaption><span>Exemplo demonstrativo</span><strong>Organização da rotina</strong></figcaption></figure>
            <figure><span className="landing-testimonials__index" aria-hidden="true">02</span><blockquote>“Ter refeições e preparos reunidos deixa as decisões do dia mais simples.”</blockquote><figcaption><span>Exemplo demonstrativo</span><strong>Praticidade no dia a dia</strong></figcaption></figure>
            <figure><span className="landing-testimonials__index" aria-hidden="true">03</span><blockquote>“O histórico me ajuda a acompanhar meus registros sem perder o contexto.”</blockquote><figcaption><span>Exemplo demonstrativo</span><strong>Acompanhamento pessoal</strong></figcaption></figure>
          </div>
        </div>
      </section>

      <section className="landing-pricing" id="planos" aria-labelledby="landing-pricing-title">
        <header className="landing-pricing__heading">
          <div><p className="landing-kicker">Nutri-AI Premium</p><h2 id="landing-pricing-title">Escolha o plano<br/><em>ideal para você.</em></h2></div>
          <p>Todos os períodos oferecem o mesmo acesso Premium. A assinatura é iniciada pelo fluxo seguro depois da criação e acesso à conta.</p>
        </header>
        <div className="landing-pricing__options">
          {subscriptionPlans.map((plan) => <article className={plan.code === 'QUARTERLY' ? 'landing-plan-option landing-plan-option--accent' : 'landing-plan-option'} key={plan.code}>
            <div className="landing-plan-option__top"><span>{plan.shortName}</span></div>
            <h3>{plan.name}</h3>
            <p className="landing-plan-option__price"><strong>{plan.price}</strong><span>{plan.period}</span></p>
            <p className="landing-plan-option__equivalent">{plan.equivalent}</p>
            <ul className="landing-plan-option__features" aria-label={`Benefícios do ${plan.name}`}>
              {premiumFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <button className="landing-button landing-button--secondary" type="button" onClick={onRegister}>Criar conta</button>
          </article>)}
        </div>
        <p className="landing-pricing__footnote"><span aria-hidden="true">✦</span> Você começa com três gerações gratuitas. O checkout é apresentado no fluxo autenticado quando necessário.</p>
      </section>
      <section className="landing-disclaimer"><strong>Uma ferramenta de organização, não um diagnóstico.</strong><p>As informações são estimativas e não substituem orientação individual de nutricionista ou médico.</p></section>

      <section className="landing-faq" id="faq" aria-labelledby="landing-faq-title">
        <div className="landing-faq__intro">
          <p className="landing-kicker">Perguntas frequentes</p>
          <h2 id="landing-faq-title">Antes de começar,<br/><em>vale saber.</em></h2>
          <p className="landing-handwritten">informação clara<br/>também faz bem.</p>
        </div>
        <div className="landing-faq__list">
          {faqItems.map((item, index) => <details key={item.question}>
            <summary><span>{String(index + 1).padStart(2, '0')}</span>{item.question}</summary>
            <div><p>{item.answer}</p></div>
          </details>)}
        </div>
      </section>

      <section className="landing-final-cta" aria-labelledby="landing-final-cta-title">
        <div className="landing-final-cta__botanical landing-final-cta__botanical--left" aria-hidden="true"><i/><i/><i/><i/></div>
        <div className="landing-final-cta__inner">
          <div className="landing-final-cta__copy">
            <p className="landing-kicker">Seu próximo passo</p>
            <h2 id="landing-final-cta-title">Sua melhor versão<br/><em>começa com uma escolha.</em></h2>
            <p>Experimente o Nutri-AI e transforme suas informações em uma semana alimentar mais organizada.</p>
          </div>
          <div className="landing-final-cta__action">
            <p className="landing-handwritten">com você,<br/>no seu ritmo.</p>
            <button className="landing-button landing-final-cta__button" type="button" onClick={onStart}>Começar agora gratuitamente <span aria-hidden="true">→</span></button>
            <ul aria-label="Condições para começar"><li>Três gerações gratuitas</li><li>Sem pagamento para começar</li></ul>
          </div>
        </div>
        <div className="landing-final-cta__botanical landing-final-cta__botanical--right" aria-hidden="true"><i/><i/><i/><i/></div>
      </section>
    </main>
    <footer className="landing-footer">
      <div className="landing-footer__main">
        <a className="landing-footer__brand" href="#inicio" aria-label="Nutri-AI, voltar ao início"><BrandLogo/></a>
        <nav aria-label="Navegação do rodapé"><PublicLinks /></nav>
        <div className="landing-footer__actions"><button type="button" onClick={onLogin}>Entrar</button><button type="button" onClick={onStart}>Começar grátis</button></div>
      </div>
      <div className="landing-footer__bottom"><p>Planejamento alimentar e evolução em um só lugar.</p><p>© {new Date().getFullYear()} Nutri-AI.</p></div>
    </footer>
  </div>
}
