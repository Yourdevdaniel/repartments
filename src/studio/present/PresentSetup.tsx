/**
 * "Before presenting": a few yes/no questions right before going full screen, each with an example
 * of what it changes. Plain names ("Recepção", "Buscar leads", "Banco de dados") or the code's own
 * ("Backend Routes", "search_leads", "PostgreSQL"), one switch at a time; whether scenes move on by
 * themselves; and which scenes to show. No labels about who's watching: it's the presenter's call.
 */
import { useEffect, useRef } from 'react'
import type { Text } from '../../shared/studio'
import type { Naming } from '../../scene/tour'
import type { L, Lang } from '../../ui/roles'

export type SetupOptions = {
  naming: Naming
  onNaming: (naming: Naming) => void
  /** One example per switch, [plain, code]; switches without one aren't shown (nothing to change). */
  examples: Partial<Record<keyof Naming, [Text, Text]>>
  /** Every scene, to pick which ones to show; left out for commits. */
  scenes?: { id: string; title: string; on: boolean }[]
  onScene?: (id: string, on: boolean) => void
}

const w = {
  title: { en: 'Before presenting', pt: 'Antes de apresentar' },
  lead: { en: 'A few choices about what appears on screen. You can change them any time.', pt: 'Algumas escolhas sobre o que aparece na tela. Dá para mudar quando quiser.' },
  parts: { en: 'Swap the names of the system’s parts for simpler ones?', pt: 'Trocar os nomes das partes do sistema por nomes mais simples?' },
  tools: { en: 'Swap the names of the AI’s tools for simpler ones?', pt: 'Trocar os nomes das ferramentas da IA por nomes mais simples?' },
  services: { en: 'Swap brands and the AI model’s name for general names?', pt: 'Trocar as marcas e o nome do modelo de IA por nomes gerais?' },
  example: (from: string, to: string): L => ({ en: `For example: “${from}” becomes “${to}”`, pt: `Por exemplo: “${from}” vira “${to}”` }),
  yes: { en: 'Yes', pt: 'Sim' },
  no: { en: 'No', pt: 'Não' },
  auto: { en: 'Move on to the next scene by itself?', pt: 'Passar para a próxima cena sozinho?' },
  autoHint: { en: 'Each scene plays once, then the next one starts.', pt: 'Cada cena passa uma vez e a próxima começa.' },
  scenes: { en: 'Which scenes to show?', pt: 'Quais cenas mostrar?' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },
  start: { en: 'Start', pt: 'Começar' },
}

/** One yes/no question, with an example of what changes. */
function Question({ title, hint, on, onChange, lang }: { title: string; hint?: string; on: boolean; onChange: (on: boolean) => void; lang: Lang }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_4px_14px_-10px_rgba(40,52,110,0.5)]">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[13px] leading-snug font-extrabold">{title}</p>
        {hint && <p className="mt-0.5 text-xs leading-snug text-ink-soft">{hint}</p>}
      </div>
      <span className="flex shrink-0 rounded-full bg-ink/[0.06] p-1" role="group" aria-label={title}>
        {([true, false] as const).map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={on === value}
            onClick={() => onChange(value)}
            className={`h-8 min-w-14 rounded-full px-3 text-xs font-extrabold transition-colors ${on === value ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
          >
            {(value ? w.yes : w.no)[lang]}
          </button>
        ))}
      </span>
    </li>
  )
}

export function PresentSetup({
  options,
  lang,
  auto,
  onAuto,
  onStart,
  onClose,
}: {
  options: SetupOptions
  lang: Lang
  auto: boolean
  onAuto: (on: boolean) => void
  onStart: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    // No close() on cleanup: React's development double-mount would fire `close` and shut the
    // dialog right after opening it. The element goes away with the component anyway.
    if (d && !d.open) d.showModal()
  }, [])

  const { naming, onNaming, examples, scenes, onScene } = options
  const groups = (['parts', 'tools', 'services'] as const).filter((g) => examples[g])
  const anyOn = !scenes || scenes.some((s) => s.on)

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="setup-title"
      className="m-auto max-h-[min(44rem,calc(100dvh-2rem))] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-white/80 bg-[#f7f8fd] p-0 text-ink shadow-[0_30px_80px_-30px_rgba(40,52,110,0.6)] backdrop:bg-ink/30"
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="border-b border-ink/10 px-5 py-4">
          <h2 id="setup-title" className="text-lg font-extrabold">
            ▶ {w.title[lang]}
          </h2>
          <p className="text-[13px] leading-snug text-ink-soft">{w.lead[lang]}</p>
        </header>
        <div className="grid gap-5 overflow-y-auto px-5 py-4">
          <ul className="grid gap-2.5">
            {groups.map((g) => {
              const [plain, code] = examples[g]!
              return (
                <Question
                  key={g}
                  title={w[g][lang]}
                  hint={w.example(code[lang], plain[lang])[lang]}
                  on={naming[g] === 'plain'}
                  onChange={(on) => onNaming({ ...naming, [g]: on ? 'plain' : 'code' })}
                  lang={lang}
                />
              )
            })}
            <Question title={w.auto[lang]} hint={w.autoHint[lang]} on={auto} onChange={onAuto} lang={lang} />
          </ul>
          {scenes && onScene && (
            <section>
              <h3 className="text-sm font-extrabold">{w.scenes[lang]}</h3>
              <ul className="mt-2 grid gap-1.5">
                {scenes.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-[13px] font-bold">
                      <input type="checkbox" checked={s.on} onChange={(e) => onScene(s.id, e.target.checked)} className="size-4 accent-[#2f8fe6]" />
                      {s.title}
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-ink/10 px-5 py-3">
          <button type="button" onClick={() => dialog.current?.close()} className="h-10 rounded-full px-4 text-sm font-extrabold text-ink-soft hover:bg-ink/5 hover:text-ink">
            {w.cancel[lang]}
          </button>
          <button
            type="button"
            disabled={!anyOn}
            onClick={onStart}
            className="h-10 rounded-full bg-accent px-5 text-sm font-extrabold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            ▶ {w.start[lang]}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
