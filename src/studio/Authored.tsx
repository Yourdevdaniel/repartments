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
import { useDetailsMenu } from './lib/menu'
import { saveBlob } from './store'

const w = {
  script: { en: 'Script', pt: 'Roteiro' },
  fromCode: { en: 'Read from the code', pt: 'Lido do código' },
  fromAuthor: { en: "Author's script", pt: 'Roteiro do autor' },
  copyPrompt: { en: 'Copy prompt for the AI', pt: 'Copiar prompt para a IA' },
  copyTitle: {
    en: "The fixed instructions plus this repo, its branch and commit, and what the studio read as a draft. What you give an AI follows that AI's own terms.",
    pt: 'As instruções fixas mais este repositório, a branch, o commit e o rascunho do que o estúdio leu. O que você entrega a uma IA segue os termos dela.',
  },
  importTitle: { en: 'A repartments.json, or any text with a ```json block in it.', pt: 'Um repartments.json, ou qualquer texto com um bloco ```json.' },
  copied: { en: 'Copied!', pt: 'Copiado!' },
  savedAsFile: { en: "Couldn't copy: saved as a file", pt: 'Não deu para copiar: salvo como arquivo' },
  copyHint: {
    en: 'Paste it into your AI (ideally one that sees the repo) and import here the repartments.json it returns. The studio sends nothing, and the text has only names and descriptions, never file contents.',
    pt: 'Cole na sua IA (de preferência uma que veja o repositório) e importe aqui o repartments.json que ela devolver. O estúdio não envia nada, e o texto leva só nomes e descrições, nunca o conteúdo dos arquivos.',
  },
  view: { en: 'See the prompt', pt: 'Ver o prompt' },
  promptLabel: { en: 'The prompt for the AI', pt: 'O prompt para a IA' },
  promptLead: {
    en: "This is what goes to the AI: Repartments' rules, the request and a draft of what the studio read. Paste it into the AI you use (the studio sends nothing), then bring the answer back with Script → Paste the AI's answer.",
    pt: 'Este é o texto que vai para a IA: as regras do Repartments, o pedido e o rascunho do que o estúdio leu. Cole na IA que você usa (o estúdio não envia nada) e depois traga a resposta em Roteiro → Colar a resposta da IA.',
  },
  import: { en: 'Import script from a file…', pt: 'Importar roteiro de um arquivo…' },
  paste: { en: "Paste the AI's answer…", pt: 'Colar a resposta da IA…' },
  pasteHint: {
    en: 'You can paste the whole answer: the studio finds the script inside the text.',
    pt: 'Pode colar a resposta inteira: o estúdio encontra o roteiro no meio do texto.',
  },
  use: { en: 'Use this script', pt: 'Usar este roteiro' },
  export: { en: 'Export script', pt: 'Exportar roteiro' },
  exportHint: {
    en: 'Downloads the script on screen, with your edits, as repartments.json. Keep it at the root of the repo and the studio uses it every time.',
    pt: 'Baixa o roteiro que está na tela, com as suas edições, como o arquivo repartments.json. Guarde-o na raiz do repositório e o estúdio passa a usá-lo sempre.',
  },
  automatic: { en: 'Show the scenes read from the code', pt: 'Ver as cenas lidas do código' },
  authoredScenes: { en: "Back to the author's scenes", pt: 'Voltar às cenas do autor' },
  remove: { en: 'Remove the imported script', pt: 'Tirar o roteiro importado' },
  fromRepo: { en: 'file in the repo (repartments.json)', pt: 'arquivo do repositório (repartments.json)' },
  imported: { en: 'imported', pt: 'importado' },
  refused: { en: "The script couldn't be used:", pt: 'O roteiro não pôde ser usado:' },
  copyFix: { en: 'Copy correction request for the AI', pt: 'Copiar pedido de correção para a IA' },
  technical: { en: 'Technical detail', pt: 'Detalhe técnico' },
  readFailed: { en: "Couldn't read that file.", pt: 'Não deu para ler esse arquivo.' },
  stale: (commit: string, date: string | null): L => ({
    en: `Written for an earlier version of the code (commit ${commit}${date ? `, ${date}` : ''}). The code has changed since: check that the script still holds.`,
    pt: `Escrito para uma versão anterior do código (commit ${commit}${date ? `, ${date}` : ''}). O código mudou desde então: confira se o roteiro ainda vale.`,
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

/** The prompt in full, to read before copying it: the same text "Copy prompt for the AI" copies. */
export function PromptPanel({ prompt, lang }: { prompt: string; lang: Lang }) {
  const [copied, copy] = useCopy()
  return (
    <div>
      <p className="text-[11px] leading-snug text-ink-soft">{w.promptLead[lang]}</p>
      <textarea
        readOnly
        value={prompt}
        rows={8}
        spellCheck={false}
        aria-label={w.promptLabel[lang]}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full resize-y rounded-xl border border-ink/10 bg-white p-2 font-mono text-[11px] leading-snug text-ink"
      />
      <button
        type="button"
        onClick={() => void copy(prompt, 'repartments-prompt.txt')}
        className="mt-1 h-8 rounded-full bg-ink px-3 text-xs font-extrabold text-white"
        title={w.copyTitle[lang]}
      >
        📋 {said(copied, w.copyPrompt)[lang]}
      </button>
    </div>
  )
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
  const menu = useDetailsMenu()
  const file = useRef<HTMLInputElement>(null)
  const [copied, copy] = useCopy()
  const [error, setError] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [pasted, setPasted] = useState('')
  const close = () => {
    menu.close()
    setPasting(false)
    setViewing(false)
  }
  // Every action looks like a button: the main one filled, the rest light.
  const item = 'flex w-full items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.04] px-3.5 py-2 text-left text-xs font-extrabold text-ink transition-colors hover:bg-ink/[0.09]'
  const main = 'flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-ink/85'

  const copyPrompt = () => copy(authorPrompt(model), 'repartments-prompt.txt')
  const read = async (f: File | undefined) => {
    if (!f) return
    close()
    try {
      setError(null)
      onImport(await f.text())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (file.current) file.current.value = ''
    }
  }
  const exportScript = () => {
    saveBlob('repartments.json', new Blob([exportAuthored(model, flows)], { type: 'application/json' }))
    close()
  }

  return (
    <details ref={menu.details} onToggle={menu.onToggle} className="relative">
      <summary ref={menu.summary} role="button" aria-expanded={menu.open} className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full bg-white/80 px-3.5 text-xs font-extrabold text-ink transition-colors hover:bg-white">
        📝 {w.script[lang]} <span className="font-bold text-ink-soft">· {(model.authored && !showingAutomatic && !refused(model) ? w.fromAuthor : w.fromCode)[lang]}</span>
      </summary>
      <div className={`absolute right-0 z-30 mt-2 ${viewing ? 'w-[min(34rem,calc(100vw-2rem))]' : 'w-72'} rounded-[22px] border border-white/80 bg-white p-2 shadow-[0_18px_50px_-22px_rgba(40,52,110,0.45)]`}>
        <p className="px-2 pt-1 pb-2 text-[11px] leading-snug text-ink-soft">{w.copyHint[lang]}</p>
        <div className="grid gap-1.5">
          <button type="button" onClick={copyPrompt} className={main} title={w.copyTitle[lang]}>
            📋 {said(copied, w.copyPrompt)[lang]}
          </button>
          <button type="button" onClick={() => setViewing((v) => !v)} className={item} aria-expanded={viewing}>
            👁 {w.view[lang]}
          </button>
          {viewing && (
            <div className="px-3 pb-2">
              <PromptPanel prompt={authorPrompt(model)} lang={lang} />
            </div>
          )}
          <button type="button" onClick={() => file.current?.click()} className={item} title={w.importTitle[lang]}>
            📂 {w.import[lang]}
          </button>
          <input ref={file} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
          {error !== null && (
            <p className="px-3 pb-1 text-[11px] font-bold text-[#c2410c]" title={error}>
              {w.readFailed[lang]} <code className="font-normal">{error}</code>
            </p>
          )}
          <button type="button" onClick={() => setPasting((p) => !p)} className={item} aria-expanded={pasting} title={w.importTitle[lang]}>
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

const PLACES: Record<string, L> = {
  parts: { en: 'Part', pt: 'Parte' },
  features: { en: 'Feature', pt: 'Funcionalidade' },
  scenes: { en: 'Scene', pt: 'Cena' },
  cast: { en: 'character', pt: 'personagem' },
  steps: { en: 'step', pt: 'passo' },
  paths: { en: 'path', pt: 'caminho' },
}

/** "scenes[0].steps[3]" as anyone reads it ("Cena 1, passo 4"); the path itself stays on screen for people who code. */
export function placeOf(where: string, lang: Lang): string {
  return [...where.matchAll(/(\w+)\[(\d+)\]/g)]
    .map(([, key, n]) => (PLACES[key] ? `${PLACES[key][lang]} ${Number(n) + 1}` : ''))
    .filter(Boolean)
    .join(', ')
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
        {errors.some((e) => e.detail) && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[11px] font-bold">{w.technical[lang]}</summary>
            <code className="text-[11px]">{errors.map((e) => e.detail).filter(Boolean).join(' · ')}</code>
          </details>
        )}
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
                {placeOf(n.where, lang) && <b className="text-ink">{placeOf(n.where, lang)}: </b>}
                {n.message[lang]} {n.where && <code className="text-[11px] text-ink-soft/80">{n.where}</code>}
              </li>
            ))}
          </ul>
          {fixButton}
        </details>
      )}
    </div>
  )
}
