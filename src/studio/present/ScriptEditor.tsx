/**
 * The script editor: the generated presentation is a first draft, and the presenter knows the
 * client's words. Here they can rename the residents ("Leads API" → "Recepção"), rewrite any
 * caption, retitle scenes and leave scenes out. Edits are kept apart from the model (per language
 * on screen), so reading the repo again keeps them, and "Restore" brings the generated text back.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { Actor, Flow } from '../../shared/studio'
import { NO_EDITS, type ScriptEdits } from '../../scene/tour'
import type { Lang } from '../../ui/roles'

const w = {
  title: { en: 'Edit the script', pt: 'Editar o roteiro' },
  lead: {
    en: 'Changes apply to the language on screen and are saved in this browser (and in the saved presentation).',
    pt: 'As mudanças valem para o idioma da tela e ficam salvas neste navegador (e na apresentação salva).',
  },
  people: { en: 'Residents', pt: 'Moradores' },
  peopleLead: { en: 'Renaming one renames it in every scene.', pt: 'Renomear um muda o nome em todas as cenas.' },
  scenes: { en: 'Scenes', pt: 'Cenas' },
  show: { en: 'Show this scene', pt: 'Mostrar esta cena' },
  sceneTitle: { en: 'Title', pt: 'Título' },
  step: (n: number) => ({ en: `Step ${n}`, pt: `Passo ${n}` }),
  restore: { en: 'Restore the generated text', pt: 'Restaurar o texto gerado' },
  done: { en: 'Done', pt: 'Pronto' },
}

const field =
  'w-full min-w-0 rounded-xl border border-ink/10 bg-white px-3 py-2 text-[13px] font-medium text-ink outline-none transition focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30'

export function ScriptEditor({
  flows,
  edits,
  onChange,
  lang,
  onClose,
  keyOf,
}: {
  /** The scenes as generated (before edits), in order. */
  flows: Flow[]
  edits: ScriptEdits
  onChange: (e: ScriptEdits) => void
  lang: Lang
  onClose: () => void
  keyOf: (a: Actor) => string
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
    return () => d?.close()
  }, [])

  /** Each participant once, however many scenes it appears in. */
  const people = useMemo(() => {
    const seen = new Map<string, Actor>()
    for (const f of flows) for (const a of f.actors) if (!seen.has(keyOf(a))) seen.set(keyOf(a), a)
    return [...seen]
  }, [flows, keyOf])

  const patch = (group: 'actors' | 'steps' | 'titles', key: string, value: string) =>
    onChange({ ...edits, [group]: { ...edits[group], [key]: { ...edits[group][key], [lang]: value } } })

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="script-title"
      className="m-auto max-h-[min(44rem,calc(100dvh-2rem))] w-[min(46rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-white/80 bg-[#f7f8fd] p-0 text-ink shadow-[0_30px_80px_-30px_rgba(40,52,110,0.6)] backdrop:bg-ink/30"
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start gap-3 border-b border-ink/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="script-title" className="text-lg font-extrabold">✏️ {w.title[lang]}</h2>
            <p className="text-xs leading-snug text-ink-soft">{w.lead[lang]}</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className="h-9 rounded-full bg-ink px-4 text-sm font-extrabold text-white">
            {w.done[lang]}
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">
          <h3 className="text-sm font-extrabold">{w.people[lang]}</h3>
          <p className="text-xs text-ink-soft">{w.peopleLead[lang]}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {people.map(([key, a]) => (
              <label key={key} className="grid gap-1 text-[11px] font-bold text-ink-soft">
                <span className="truncate">{a.name[lang]}</span>
                <input className={field} value={edits.actors[key]?.[lang] ?? a.name[lang]} onChange={(e) => patch('actors', key, e.target.value)} />
              </label>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-extrabold">{w.scenes[lang]}</h3>
          <div className="mt-2 grid gap-3">
            {flows.map((f) => {
              const hidden = edits.hidden.includes(f.id)
              return (
                <section key={f.id} className={`rounded-2xl border border-ink/10 bg-white/70 p-3 ${hidden ? 'opacity-60' : ''}`}>
                  <label className="flex items-center gap-2 text-xs font-extrabold text-ink-soft">
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={(e) => onChange({ ...edits, hidden: e.target.checked ? edits.hidden.filter((h) => h !== f.id) : [...edits.hidden, f.id] })}
                      className="accent-[#2f8fe6]"
                    />
                    {w.show[lang]}
                  </label>
                  <label className="mt-2 grid gap-1 text-[11px] font-bold text-ink-soft">
                    {w.sceneTitle[lang]}
                    <input className={`${field} font-extrabold`} value={edits.titles[f.id]?.[lang] ?? f.title[lang]} onChange={(e) => patch('titles', f.id, e.target.value)} />
                  </label>
                  <ol className="mt-2 grid gap-1.5">
                    {f.steps.map((s, i) => {
                      const key = `${f.id}#${i}`
                      return (
                        <li key={key}>
                          <label className="grid gap-1 text-[11px] font-bold text-ink-soft">
                            {w.step(i + 1)[lang]}
                            <textarea rows={2} className={`${field} resize-y`} value={edits.steps[key]?.[lang] ?? s.text[lang]} onChange={(e) => patch('steps', key, e.target.value)} />
                          </label>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => onChange(NO_EDITS)}
            className="mt-5 h-9 rounded-full bg-ink/5 px-4 text-xs font-extrabold text-ink-soft transition-colors hover:bg-ink/10 hover:text-ink"
          >
            ↺ {w.restore[lang]}
          </button>
        </div>
      </div>
    </dialog>
  )
}
