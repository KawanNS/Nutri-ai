import { AppTopbar } from '../components/layout/AppTopbar'
import { PageHeader } from '../components/layout/PageHeader'
import { useAccountMenu } from '../components/layout/accountMenuContext'
import { Paywall } from '../components/Paywall'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { Surface } from '../components/ui/Surface'

interface SubscriptionPageProps {
  onMealPlan(): void
  onChat(): void
  onDiary(): void
  onProgress(): void
  onRetry(): void
}

export function SubscriptionPage({ onMealPlan, onChat, onDiary, onProgress, onRetry }: SubscriptionPageProps) {
  const { premium } = useAccountMenu()
  const badge = premium === 'premium' ? <Badge variant="success">Premium</Badge> : premium === 'free' ? <Badge>Gratuito</Badge> : undefined

  return <div className="app-shell"><AppTopbar onMealPlan={onMealPlan} onChat={onChat} onDiary={onDiary} onProgress={onProgress}/>
    <main className="page subscription-page">
      <PageHeader eyebrow="Sua conta" title="Minha assinatura" description="Confira o status do seu acesso ao Alyvora Premium." actions={badge}/>
      {premium === 'loading'
        ? <Surface><LoadingState label="Verificando sua assinatura" description="Consultando seu acesso Premium com segurança."/></Surface>
        : premium === 'unavailable'
          ? <Alert variant="error" title="Não foi possível verificar sua assinatura">Tente novamente em instantes.<Button className="subscription-page__retry" variant="ghost" onClick={onRetry}>Tentar novamente</Button></Alert>
          : premium === 'premium'
            ? <Alert variant="success" title="Premium ativo">Seu acesso Premium está liberado para o assistente, a foto do prato e novas gerações do plano alimentar.</Alert>
            : <Paywall title="Assine o Alyvora Premium" description="Escolha um plano para liberar o assistente, a foto do prato e novas gerações do seu plano alimentar."/>}
    </main>
  </div>
}
