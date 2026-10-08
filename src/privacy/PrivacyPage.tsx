/** The privacy policy page (/privacidade, /privacy): the text in `policy.ts`, in the reader's language. */
import { glass } from '../ui/kit'
import type { Lang } from '../ui/roles'
import { CONTROLLER, GITHUB_APPS_SETTINGS, POLICY, POLICY_LEAD, POLICY_TITLE, POLICY_UPDATED } from './policy'

const w = {
  back: { en: 'Back to Repartments', pt: 'Voltar ao Repartments' },
  updated: (date: string) => ({ en: `Last updated on ${date}`, pt: `Atualizada em ${date}` }),
  contact: { en: 'Contact about your data', pt: 'Contato sobre seus dados' },
  revoke: { en: "Revoke the app's access on GitHub", pt: 'Revogar o acesso do app no GitHub' },
}

export function PrivacyPage({ lang, setLang, onGo }: { lang: Lang; setLang: (l: Lang) => void; onGo: (path: string) => void }) {
  const date = new Date(`${POLICY_UPDATED}T00:00:00`).toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'long' })
  const link = 'font-extrabold text-ink underline underline-offset-2'
  return (
    <div className="h-dvh w-full overflow-y-auto bg-[#e9efff] text-ink">
      <div className="mx-auto w-[min(46rem,100%)] px-4 py-6 md:py-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onGo('/')}
            className="h-10 rounded-full bg-white/80 px-4 text-sm font-extrabold text-ink transition-colors hover:bg-white"
          >
            ← {w.back[lang]}
          </button>
          <div className={`${glass} flex p-1`} role="group" aria-label="Language">
            {(['en', 'pt'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`h-8 rounded-full px-3 text-xs font-extrabold transition-colors ${lang === l ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <article className={`${glass} p-6 md:p-8`}>
          <h1 className="text-3xl leading-tight font-extrabold tracking-[-0.02em]">{POLICY_TITLE[lang]}</h1>
          <p className="mt-1 text-xs font-semibold text-ink-soft">{w.updated(date)[lang]}</p>
          <p className="mt-4 text-[15px] leading-relaxed">{POLICY_LEAD[lang]}</p>
          {POLICY.map((s) => (
            <section key={s.title.en} className="mt-7">
              <h2 className="text-lg font-extrabold">{s.title[lang]}</h2>
              {s.paragraphs.map((p) => (
                <p key={p.en} className="mt-2 text-[15px] leading-relaxed text-ink/90">
                  {p[lang]}
                </p>
              ))}
              {s.items && (
                <dl className="mt-2 space-y-3">
                  {s.items.map((it) => (
                    <div key={it.title.en} className="rounded-2xl bg-ink/[0.04] px-4 py-3">
                      <dt className="font-extrabold">{it.title[lang]}</dt>
                      <dd className="mt-1 text-[14px] leading-relaxed text-ink/90">{it.text[lang]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
          <p className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <a href={CONTROLLER.contact} target="_blank" rel="noreferrer" className={link}>
              {w.contact[lang]}
            </a>
            <a href={GITHUB_APPS_SETTINGS} target="_blank" rel="noreferrer" className={link}>
              {w.revoke[lang]}
            </a>
          </p>
        </article>
      </div>
    </div>
  )
}
