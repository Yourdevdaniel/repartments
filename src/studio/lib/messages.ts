/**
 * What the studio says when a request fails, in the page's language. Each message tells the person
 * what to do next, not what went wrong underneath.
 */
import type { Lang } from '../../ui/roles'

const messages: Record<string, { en: string; pt: string }> = {
  'signed-out': {
    en: 'Your session ended. Sign in again to continue.',
    pt: 'Sua sessão terminou. Entre de novo para continuar.',
  },
  forbidden: {
    en: 'GitHub doesn’t let your account read this.',
    pt: 'O GitHub não deixa sua conta ler isso.',
  },
  'not-found': {
    en: 'We couldn’t find this on GitHub.',
    pt: 'Não encontramos isso no GitHub.',
  },
  invalid: {
    en: 'Something in the search isn’t valid. Check the dates and try again.',
    pt: 'Algo na busca não é válido. Confira as datas e tente de novo.',
  },
  'rate-limited': {
    en: 'Too many requests in a row. Wait a moment and try again.',
    pt: 'Muitas consultas seguidas. Espere um pouco e tente de novo.',
  },
  'login-disabled': {
    en: 'Sign-in isn’t set up on this server yet.',
    pt: 'O login ainda não está configurado neste servidor.',
  },
  unavailable: {
    en: 'GitHub didn’t answer properly. Try again in a moment.',
    pt: 'O GitHub não respondeu direito. Tente de novo em instantes.',
  },
}

/** The sentence for a studio error code; anything unknown reads as "GitHub didn't answer". */
export function errorText(code: string, lang: Lang): string {
  return (messages[code] ?? messages.unavailable)[lang]
}

/** The studio error code inside a failed request's error, or "unavailable" when there isn't one. */
export function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : 'unavailable'
}
