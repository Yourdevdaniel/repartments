/**
 * The author's script in the studio (`repartments.json`, see `src/architecture/authored.ts`): a menu
 * in the workspace's bar to copy the prompt for an AI, import the file it wrote and export the script
 * on screen, and a notice under the bar that says where the scenes come from and what didn't check
 * out. The studio never sends the prompt anywhere: the person pastes it into the AI they choose.
 */
import { useRef, useState } from 'react'
import { exportAuthored } from '../architecture/authored'
import type { ArchitectureModel, Flow } from '../shared/studio'
import type { L, Lang } from '../ui/roles'
import { authorPrompt, fixPrompt } from './authorPrompt'
import { saveBlob } from './store'

const w = {
  script: { en: 'Script', pt: 'Roteiro' },
  fromCode: { en: 'Read from the code', pt: 'Lido do código' },
  fromAuthor: { en: "Author's script", pt: 'Roteiro do autor' },
  copyPrompt: { en: 'Copy prompt for the AI', pt: 'Copiar prompt para a IA' },
  copied: { en: 'Copied!', pt: 'Copiado!' },
  savedAsFile: { en: 'No clipboard here: saved as a file', pt: 'Sem área de transferência: salvo como arquivo' },
  copyHint: {
    en: 'Paste it into the AI you use, with access to the repo if it can. It answers with a repartments.json to import here. Nothing is sent by the studio.',
    pt: 'Cole na IA que você usa, com acesso ao repositório se ela tiver. Ela responde com um repartments.json para importar aqui. O estúdio não envia nada.',
  },
  import: { en: 'Import script…', pt: 'Importar roteiro…' },
  paste: { en: "Paste the AI's answer…", pt: 'Colar a resposta da IA…' },
  pasteHint: { en: 'The whole answer is fine: the studio finds the JSON in it.', pt: 'Pode colar a resposta inteira: o estúdio acha o JSON nela.' },
  use: { en: 'Use this script', pt: 'Usar este roteiro' },
  export: { en: 'Export script', pt: 'Exportar roteiro' },
  exportHint: {
    en: 'The script on screen, with your edits, as repartments.json: put it at the root of the repo and it is read every time.',
    pt: 'O roteiro da tela, com as suas edições, como repartments.json: coloque na raiz do repositório e ele é lido sempre.',
  },
  automatic: { en: 'Show the scenes read from the code', pt: 'Ver as cenas lidas do código' },
  authoredScenes: { en: "Back to the author's scenes", pt: 'Voltar às cenas do autor' },
  remove: { en: 'Remove the imported script', pt: 'Tirar o roteiro importado' },
  fromRepo: { en: 'repartments.json in the repo', pt: 'repartments.json do repositório' },
  imported: { en: 'imported', pt: 'importado' },
  refused: { en: "The script couldn't be used:", pt: 'O roteiro não pôde ser usado:' },
  copyFix: { en: 'Copy correction request', pt: 'Copiar pedido de correção' },
  readFailed: { en: "Couldn't read that file.", pt: 'Não deu para ler esse arquivo.' },
  stale: (commit: string, date: string | null): L => ({
    en: `Written for commit ${commit}${date ? ` on ${date}` : ''}; the code has changed since. Check that it still holds.`,
    pt: `Escrito para o commit ${commit}${date ? ` em ${date}` : ''}; o código mudou desde então. Confira se ainda vale.`,
  }),
  checked: (ok: number, missing: number): L => ({
    en: `${ok} cited file${ok === 1 ? '' : 's'} found in the repo${missing ? `, ${missing} not found` : ''}.`,
    pt: `${ok} ${ok === 1 ? 'arquivo citado encontrado' : 'arquivos citados encontrados'} no repositório${missing ? `, ${missing} não ${missing === 1 ? 'encontrado' : 'encontrados'}` : ''}.`,
  }),
  notes: (n: number): L => ({ en: `${n} note${n === 1 ? '' : 's'}`, pt: `${n} ${n === 1 ? 'aviso' : 'avisos'}` }),
}

/** Copies a text, or offers it as a file when the browser won't let the page write to the clipboard. */
async function copyText(text: string, fallbackName: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    saveBlob(fallbackName, new Blob([text], { type: 'text/plain;charset=utf-8' }))
    return false
  }
}

type Copied = 'idle' | 'copied' | 'file'

/** Copies on click and says for a moment how it went: copied, or saved as a file when there is no clipboard. */
function useCopy(): [Copied, (text: string, fallbackName: string) => Promise<void>] {
  const [state, setState] = useState<Copied>('idle')
  const copy = async (text: string, fallbackName: string) => {
    setState((await copyText(text, fallbackName)) ? 'copied' : 'file')
    window.setTimeout(() => setState('idle'), 2400)
  }
  return [state, copy]
}

/** The button's words while idle, or how the copy went. */
function said(state: Copied, idle: L): L {
  return state === 'copied' ? w.copied : state === 'file' ? w.savedAsFile : idle
}

type MenuProps = {
  model: ArchitectureModel
  /** The scenes on screen with the presenter's edits, for the export. */
  flows: Flow[]
  lang: Lang
  showingAutomatic: boolean
  onShowAutomatic: (show: boolean) => void
  onImport: (text: string) => void
  /** Present when an imported script is in use. */
  onRemoveImport: (() => void) | null
}

/** The "Script" menu in the workspace's bar. */
export function AuthoredMenu({ model, flows, lang, showingAutomatic, onShowAutomatic, onImport, onRemoveImport }: MenuProps) {
  const menu = useRef<HTMLDetailsElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [copied, copy] = useCopy()
  const [error, setError] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const close = () => {
    menu.current?.removeAttribute('open')
    setPasting(false)
  }
  const item = 'block w-full rounded-xl px-3 py-2 text-left text-xs font-extrabold text-ink hover:bg-ink/[0.06]'

  const copyPrompt = () => copy(authorPrompt(model), 'repartments-prompt.txt')
  const read = async (f: File | undefined) => {
    if (!f) return
    close()
    try {
      setError(false)
      onImport(await f.text())
    } catch {
      setError(true)
    } finally {
      if (file.current) file.current.value = ''
    }
  }
  const exportScript = () => {
    saveBlob('repartments.json', new Blob([exportAuthored(model, flows)], { type: 'application/json' }))
    close()
  }

  return (
    <details ref={menu} className="relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full bg-white/80 px-3.5 text-xs font-extrabold text-ink transition-colors hover:bg-white">
        📝 {w.script[lang]} <span className="font-bold text-ink-soft">· {(model.authored && !showingAutomatic && !refused(model) ? w.fromAuthor : w.fromCode)[lang]}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 rounded-[22px] border border-white/80 bg-white p-2 shadow-[0_18px_50px_-22px_rgba(40,52,110,0.45)]">
        <button type="button" onClick={copyPrompt} className={item}>
          📋 {said(copied, w.copyPrompt)[lang]}
        </button>
        <p className="px-3 pb-2 text-[11px] leading-snug text-ink-soft">{w.copyHint[lang]}</p>
        <button type="button" onClick={() => file.current?.click()} className={item}>
          📂 {w.import[lang]}
        </button>
        <input ref={file} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
        {error && <p className="px-3 pb-1 text-[11px] font-bold text-[#c2410c]">{w.readFailed[lang]}</p>}
        <button type="button" onClick={() => setPasting((p) => !p)} className={item} aria-expanded={pasting}>
          📥 {w.paste[lang]}
        </button>
        {pasting && (
          <div className="px-3 pb-2">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={5}
              spellCheck={false}
              aria-label={w.paste[lang]}
              className="w-full resize-y rounded-xl border border-ink/10 bg-white p-2 font-mono text-[11px] text-ink"
            />
            <p className="pb-1 text-[11px] leading-snug text-ink-soft">{w.pasteHint[lang]}</p>
            <button
              type="button"
              disabled={!pasted.trim()}
              onClick={() => {
                onImport(pasted)
                setPasted('')
                close()
              }}
              className="h-8 rounded-full bg-ink px-3 text-xs font-extrabold text-white disabled:opacity-40"
            >
              {w.use[lang]}
            </button>
          </div>
        )}
        <button type="button" onClick={exportScript} className={item} title={w.exportHint[lang]}>
          💾 {w.export[lang]}
        </button>
        {model.automatic && (
          <button
            type="button"
            onClick={() => {
              onShowAutomatic(!showingAutomatic)
              close()
            }}
            className={item}
          >
            🔎 {(showingAutomatic ? w.authoredScenes : w.automatic)[lang]}
          </button>
        )}
        {onRemoveImport && (
          <button
            type="button"
            onClick={() => {
              onRemoveImport()
              close()
            }}
            className={item}
          >
            ✕ {w.remove[lang]}
          </button>
        )}
      </div>
    </details>
  )
}

/** "2026-10-08" as the reader writes dates; null stays null. */
function dayOf(date: string | null, lang: Lang): string | null {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Whether the script was refused as a whole (not JSON, a newer version…). */
function refused(model: ArchitectureModel): boolean {
  return !!model.authored?.problems.some((p) => p.level === 'error')
}

/** Under the bar: where the scenes come from, whether the script may be out of date, and its notes. */
export function AuthoredNotice({ model, lang }: { model: ArchitectureModel; lang: Lang }) {
  const [copied, copy] = useCopy()
  const info = model.authored
  if (!info) return null
  const notes = info.problems.filter((p) => p.level === 'warning')
  const errors = info.problems.filter((p) => p.level === 'error')
  const copyFix = () => copy(fixPrompt(info.problems, lang), 'repartments-correcao.txt')
  const fixButton = (
    <button type="button" onClick={copyFix} className="ml-2 rounded-full bg-ink/[0.07] px-3 py-1 text-[11px] font-extrabold text-ink hover:bg-ink/[0.12]">
      📋 {said(copied, w.copyFix)[lang]}
    </button>
  )
  if (errors.length)
    return (
      <div className="mx-3 mb-2 rounded-2xl bg-[#fff1e6] px-4 py-2 text-xs text-[#9a3412] md:mx-4">
        <b>{w.refused[lang]}</b> {errors.map((e) => e.message[lang]).join(' ')}
        {fixButton}
      </div>
    )
  return (
    <div className="mx-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white/70 px-4 py-2 text-xs text-ink-soft md:mx-4">
      <span className="font-extrabold text-ink">
        📝 {w.fromAuthor[lang]} · {info.source === 'repo' ? w.fromRepo[lang] : w.imported[lang]}
      </span>
      <span>{w.checked(info.verified, info.unverified)[lang]}</span>
      {info.stale && info.commit && <span className="font-bold text-[#b45309]">⚠ {w.stale(info.commit, dayOf(info.writtenAt, lang))[lang]}</span>}
      {notes.length > 0 && (
        <details>
          <summary className="cursor-pointer font-bold text-ink">{w.notes(notes.length)[lang]}</summary>
          <ul className="mt-1 list-disc pl-5">
            {notes.map((n, i) => (
              <li key={i}>
                {n.where && <code className="text-[11px]">{n.where}</code>} {n.message[lang]}
              </li>
            ))}
          </ul>
          {fixButton}
        </details>
      )}
    </div>
  )
}
