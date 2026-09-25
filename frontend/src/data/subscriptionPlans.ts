import type { SubscriptionPlan } from '../types/subscription'

export interface SubscriptionPlanOption {
  code: SubscriptionPlan
  name: string
  shortName: string
  price: string
  period: string
  equivalent: string
}

export const premiumFeatures = [
  'Gerações liberadas durante a assinatura',
  'Plano personalizado de 7 dias',
  'Refeições com preparo e estimativas nutricionais',
  'Lista de compras organizada por categoria',
  'Estimativas de custo diário e semanal',
] as const

export const subscriptionPlans: SubscriptionPlanOption[] = [
  { code: 'MONTHLY', name: 'Nutri-AI Mensal', shortName: 'Mensal', price: 'R$ 19,90', period: '/ mês', equivalent: 'Cobrança mensal' },
  { code: 'QUARTERLY', name: 'Nutri-AI Trimestral', shortName: 'Trimestral', price: 'R$ 49,90', period: '/ 3 meses', equivalent: 'Equivale a ~R$ 16,63/mês' },
  { code: 'ANNUAL', name: 'Nutri-AI Anual', shortName: 'Anual', price: 'R$ 159,90', period: '/ ano', equivalent: 'Equivale a ~R$ 13,33/mês' },
]
