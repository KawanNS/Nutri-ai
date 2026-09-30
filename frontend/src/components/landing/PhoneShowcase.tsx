import { BrandLogo } from '../BrandLogo'
import mealPhoto from '../../assets/landing/differentials-food-photo.png'

function PhoneStatus() {
  return <div className="public-phone__status" aria-hidden="true"><span>9:41</span><span>● ● ●</span></div>
}

function PhoneBrand() {
  return <div className="public-phone__brand"><BrandLogo variant="symbol"/><strong>Nutri-AI</strong></div>
}

export function PhoneShowcase() {
  return <div className="public-showcase" aria-label="Demonstração visual: plano diário, foto de uma refeição, análise e registro">
    <div className="public-showcase__shape" aria-hidden="true"/>

    <div className="public-phone public-phone--secondary public-phone--plan" aria-hidden="true">
      <div className="public-phone__shell">
        <PhoneStatus/>
        <PhoneBrand/>
        <p className="public-mini-label">Meu plano</p>
        <h3>Refeições de hoje</h3>
        <div className="public-plan-row"><span>08:00</span><div><strong>Café da manhã</strong><small>Iogurte, banana e aveia</small></div></div>
        <div className="public-plan-row public-plan-row--active"><span>12:30</span><div><strong>Almoço</strong><small>Frango, arroz e salada</small></div></div>
        <div className="public-plan-row"><span>16:00</span><div><strong>Lanche</strong><small>Fruta e castanhas</small></div></div>
      </div>
    </div>

    <div className="public-phone public-phone--secondary public-phone--assistant" aria-hidden="true">
      <div className="public-phone__shell">
        <PhoneStatus/>
        <PhoneBrand/>
        <p className="public-mini-label">Assistente</p>
        <div className="public-chat-bubble public-chat-bubble--user">Como organizo meu jantar hoje?</div>
        <div className="public-chat-bubble">Posso ajudar a pensar em uma opção com base no seu plano e na sua rotina.</div>
        <div className="public-chat-composer">Pergunte sobre sua alimentação <span>→</span></div>
      </div>
    </div>

    <div className="public-phone public-phone--main">
      <div className="public-phone__speaker" aria-hidden="true"/>
      <div className="public-phone__shell public-phone__shell--main">
        <PhoneStatus/>

        <section className="public-phone-screen public-phone-screen--home" aria-label="Resumo do dia">
          <PhoneBrand/>
          <div className="public-home-greeting"><span>Olá! 👋</span><small>Seu dia, de um jeito simples.</small></div>
          <div className="public-progress-card">
            <div className="public-progress-ring"><span><strong>1.250</strong><small>kcal</small></span></div>
            <div><small>Progresso diário</small><strong>1.250 / 2.000 kcal</strong><span>Um passo de cada vez</span></div>
          </div>
          <div className="public-macros"><span><strong>98g</strong>Proteínas</span><span><strong>120g</strong>Carboidratos</span><span><strong>32g</strong>Gorduras</span></div>
          <div className="public-next-meal"><div><small>Próxima refeição · 12:30</small><strong>Almoço</strong><span>Frango, arroz e salada</span></div><b>→</b></div>
          <div className="public-phone-action">Registrar refeição <span>＋</span></div>
        </section>

        <section className="public-phone-screen public-phone-screen--camera" aria-label="Demonstração de foto do prato">
          <div className="public-camera-copy"><strong>Enquadre sua refeição</strong><span>Use uma foto nítida e bem iluminada</span></div>
          <img src={mealPhoto} alt="Prato com frango, grãos e vegetais"/>
          <div className="public-camera-frame" aria-hidden="true"/>
          <div className="public-camera-flash" aria-hidden="true"/>
          <div className="public-camera-controls" aria-hidden="true"><i/><b>Foto</b><span>Manual</span></div>
        </section>

        <section className="public-phone-screen public-phone-screen--analysis" aria-label="Demonstração da análise da refeição">
          <PhoneBrand/>
          <div className="public-analysis-visual" aria-hidden="true"><span>✦</span><i/><i/><i/></div>
          <h3>Analisando sua refeição...</h3>
          <p>Organizando uma estimativa para você revisar.</p>
          <ul>
            <li><span>✓</span><div><strong>Arroz</strong><small>Porção ilustrativa</small></div></li>
            <li><span>✓</span><div><strong>Frango</strong><small>Porção ilustrativa</small></div></li>
            <li><span>✓</span><div><strong>Salada</strong><small>Porção ilustrativa</small></div></li>
          </ul>
        </section>

        <section className="public-phone-screen public-phone-screen--success" aria-label="Demonstração da refeição registrada">
          <PhoneBrand/>
          <div className="public-success-mark" aria-hidden="true">✓</div>
          <h3>Refeição registrada</h3>
          <p>Seu dia foi atualizado. Você pode revisar as informações quando quiser.</p>
          <div className="public-success-progress"><span><i/></span><div><strong>Progresso diário atualizado</strong><small>Refeição adicionada ao seu dia</small></div></div>
          <div className="public-phone-action">Ver meu dia <span>→</span></div>
        </section>
      </div>
    </div>
  </div>
}
