import { ApiError } from './api'

const messages: Record<string, string> = {
  LOCAL_ACCOUNT_EXISTS: 'Já existe uma conta com este e-mail. Entre com seu e-mail e senha.',
  GOOGLE_EMAIL_NOT_VERIFIED: 'Seu e-mail do Google ainda não foi verificado.',
  GOOGLE_AUDIENCE_MISMATCH: 'Não foi possível validar o Google devido a uma inconsistência de configuração.',
  GOOGLE_CREDENTIAL_EXPIRED: 'Sua sessão do Google expirou. Abra o Google novamente para continuar.',
  GOOGLE_UNAVAILABLE: 'O Google está indisponível no momento. Tente novamente mais tarde.',
  GOOGLE_CODE_INVALID: 'A autorização do Google expirou ou já foi usada. Tente novamente.',
  GOOGLE_CODE_FLOW_UNAVAILABLE: 'O login com Google está indisponível no momento. Tente novamente mais tarde.',
  GOOGLE_CREDENTIAL_INVALID: 'Sua sessão do Google é inválida ou expirou. Tente novamente.',
}

/** What to tell the person when exchanging the Google code for a session fails. */
export function googleAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code && messages[error.code]) return messages[error.code]
  if (error instanceof ApiError && error.status === 400) return 'O Google não retornou uma credencial válida. Tente novamente.'
  if (error instanceof ApiError && error.status >= 500) return 'O cadastro está temporariamente indisponível. Tente novamente em instantes.'
  if (error instanceof TypeError) return 'Não foi possível conectar. Verifique sua internet e tente novamente.'
  return 'Não foi possível continuar com Google agora. Tente novamente.'
}
