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
  const badge = premium === 'premium' ? <Badge variant="success">Premium</Badge> : premium === 'admin' ? <Badge variant="success">Premium (admin)</Badge> : premium === 'free' ? <Badge>Gratuito</Badge> : undefined

  return <div className="app-shell"><AppTopbar onMealPlan={onMealPlan} onChat={onChat} onDiary={onDiary} onProgress={onProgress}/>
    <main className="page page--narrow subscription-page">
      <PageHeader title="Minha assinatura" actions={badge}/>
      {premium === 'loading'
        ? <Surface><LoadingState label="Verificando sua assinatura" description="Só um instante."/></Surface>
        : premium === 'unavailable'
          ? <Alert variant="error" title="Não foi possível verificar sua assinatura">Tente novamente em instantes.<Button className="subscription-page__retry" variant="ghost" onClick={onRetry}>Tentar novamente</Button></Alert>
          : premium === 'premium'
            ? <Alert variant="success" title="Premium ativo">Assistente, foto do prato e planos novos estão liberados.</Alert>
            : premium === 'admin'
              ? <Alert variant="success" title="Premium (admin)">Conta de administrador: assistente, foto do prato e planos novos liberados, sem assinatura paga.</Alert>
            : <Paywall title="Assine o Alyvora Premium" description="Libere o assistente, a foto do prato e planos novos sempre que precisar."/>}
    </main>
  </div>
}
