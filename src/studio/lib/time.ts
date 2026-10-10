/**
 * Date and time text for the studio, in the page's language. Everything is formatted in the
 * viewer's own time zone, which is what "today" means to them.
 */
import type { Lang } from '../../ui/roles'

const locale = (lang: Lang) => (lang === 'pt' ? 'pt-BR' : 'en')

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['week', 7 * 86_400],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
]

/** "há 3 dias" / "3 days ago", "ontem" / "yesterday", "agora" / "now" for anything under a minute. */
export function relativeTime(iso: string, now: Date, lang: Lang): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = (then - now.getTime()) / 1000
  const fmt = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' })
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diff) >= seconds) return fmt.format(Math.round(diff / seconds), unit)
  }
  return fmt.format(0, 'second')
}

/** A day's heading: "Hoje" / "Ontem" / "Today" / "Yesterday", else the date, with the year only when it isn't this one. */
export function dayLabel(day: Date, now: Date, lang: Lang): string {
  const today = startOfDay(now)
  const diffDays = Math.round((today.getTime() - startOfDay(day).getTime()) / 86_400_000)
  if (diffDays === 0) return lang === 'pt' ? 'Hoje' : 'Today'
  if (diffDays === 1) return lang === 'pt' ? 'Ontem' : 'Yesterday'
  const sameYear = day.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(locale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(day)
}

/** The time of day, 24-hour in Portuguese and as the browser's English default otherwise. */
export function clock(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** "2 de mar. de 2026, 14:05" style, for the commit's detail view. */
export function fullDate(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Midnight of the day `d` falls on, in local time. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
