/**
 * The studio's frame: header (logo, where you are, language, account) and whichever page fits the
 * moment: sign in, pick a repo, or one repo's workspace. A presentation opened from a file needs
 * no sign-in at all.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Lang } from '../ui/roles'
import { glass, Logo } from '../ui/kit'
import { t } from './copy'
import { RepoPicker } from './RepoPicker'
import { examplePresentation } from './example'
import { parsePresentation, type PresentationFile } from './store'
import { useSession, type DeviceCode } from './session'
import { Workspace } from './Workspace'

type Props = {
  owner: string | null
  repo: string | null
  lang: Lang
  setLang: (lang: Lang) => void
  onGo: (path: string) => void
}

export function Studio({ owner, repo, lang, setLang, onGo }: Props) {
  const session = useSession()
  const [file, setFile] = useState<PresentationFile | null>(null)
  const [fileError, setFileError] = useState(false)
  const user = session.state.status === 'signed-in' ? session.state.user : null

  useEffect(() => {
    document.title = file ? `${file.model.repo.name} · ${t.studio[lang]}` : repo ? `${owner}/${repo} · ${t.studio[lang]}` : `${t.studio[lang]} · Repartments`
  }, [owner, repo, file, lang])

  // Opening another repo (or going back to the list) closes a presentation opened from a file.
  useEffect(() => setFile(null), [owner, repo])

  const open = async (picked: File) => {
    const parsed = parsePresentation(await picked.text())
    setFileError(!parsed)
    if (parsed) setFile(parsed)
  }

  let body: ReactNode
  const state = session.state
  if (file) {
    body = <Workspace key="file" source={{ kind: 'file', file }} lang={lang} />
  } else if (state.status === 'loading') {
    body = (
      <Centered>
        <p className="animate-pulse text-sm font-bold text-ink-soft">…</p>
      </Centered>
    )
  } else if (state.status === 'waiting') {
    body = (
      <Centered>
        <DeviceCodeCard code={state.code} lang={lang} onCancel={session.cancel} />
      </Centered>
    )
  } else if (state.status === 'signed-out') {
    body = (
      <Centered>
        <div className={`${glass} w-[min(32rem,100%)] p-6 text-center md:p-8`}>
          <p className="text-4xl" aria-hidden="true">🔑</p>
          <h1 className="mt-3 text-2xl leading-tight font-extrabold tracking-[-0.02em]">{t.signInTitle[lang]}</h1>
          <p className="mt-2 text-[15px] leading-snug text-ink-soft">{t.signInLead[lang]}</p>
          {state.error && (
            <p className="mt-3 rounded-2xl bg-[#ffe4e4] px-3 py-2 text-sm font-bold text-[#a12d2d]" role="alert">
              {t.signInError[state.error][lang]}
            </p>
          )}
          {state.enabled || state.devLogin ? (
            <button
              type="button"
              onClick={session.signIn}
              className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-extrabold text-white transition-transform active:scale-[0.97]"
            >
              <GitHubMark /> {state.devLogin ? t.signInDev[lang] : t.signIn[lang]}
            </button>
          ) : (
            <p className="mt-5 rounded-2xl bg-ink/5 px-4 py-3 text-sm font-semibold text-ink-soft">{t.signInOff[lang]}</p>
          )}
          <p className="mt-4 text-xs leading-snug text-ink-soft">{t.privacy[lang]}</p>
          <OpenFile lang={lang} onOpen={open} error={fileError} onExample={() => setFile(examplePresentation())} />
        </div>
      </Centered>
    )
  } else if (!owner || !repo) {
    body = (
      <div className="flex h-full justify-center overflow-y-auto p-3 md:p-6">
        <div className="w-[min(44rem,100%)]">
          <RepoPicker lang={lang} onOpen={(o, r) => onGo(`/studio/${o}/${r}`)} />
          <div className="mt-3 text-center">
            <OpenFile lang={lang} onOpen={open} error={fileError} onExample={() => setFile(examplePresentation())} />
          </div>
        </div>
      </div>
    )
  } else {
    body = <Workspace key={`${owner}/${repo}`} source={{ kind: 'repo', owner, repo }} lang={lang} />
  }

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden text-ink" style={{ background: 'linear-gradient(180deg,#dfe7ff 0%,#eceffd 45%,#f4f2fb 100%)' }}>
      <header className="z-20 flex items-center gap-2 p-3 md:p-4">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault()
            onGo('/')
          }}
          className={`${glass} flex shrink-0 items-center gap-2.5 p-2 sm:px-3.5 sm:py-2.5`}
          title={t.backHome[lang]}
          aria-label={`Repartments ${t.studio[lang]}`}
        >
          <Logo />
          {/* Phones keep just the logo, so the header stays on one line. */}
          <span className="hidden leading-tight sm:block">
            <span className="block text-base font-extrabold tracking-[-0.01em]">Repartments</span>
            <span className="block text-xs font-bold text-accent">{t.studio[lang]}</span>
          </span>
        </a>
        {(file || (owner && repo)) && (
          <nav aria-label="breadcrumb" className={`${glass} flex min-w-0 items-center gap-1.5 px-3.5 py-2.5 text-sm font-extrabold`}>
            {user && (
              <a
                href="/studio"
                onClick={(e) => {
                  e.preventDefault()
                  setFile(null)
                  onGo('/studio')
                }}
                className="shrink-0 text-ink-soft hover:text-ink"
                title={t.back[lang]}
              >
                <span aria-hidden="true">←</span>
                <span className="sr-only">{t.back[lang]}</span>
              </a>
            )}
            <span className="truncate">
              {file ? (
                <>
                  <span className="text-ink-soft">{t.savedFile[lang]} · </span>
                  {file.model.repo.owner}/{file.model.repo.name}
                </>
              ) : (
                <>
                  <span className="hidden text-ink-soft sm:inline">{owner} / </span>
                  {repo}
                </>
              )}
            </span>
          </nav>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* On a phone, one button that switches to the other language. */}
          <button
            type="button"
            onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
            aria-label={lang === 'pt' ? 'Switch to English' : 'Mudar para português'}
            className={`${glass} h-10 px-3 text-xs font-extrabold text-ink-soft sm:hidden`}
          >
            {lang === 'pt' ? 'EN' : 'PT'}
          </button>
          <div className={`${glass} hidden p-1 sm:flex`} role="group" aria-label="Language">
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
          {user && (
            <div className={`${glass} flex items-center gap-2 py-1 pr-1 pl-1.5`}>
              {user.avatarUrl && <img src={user.avatarUrl} alt="" className="size-8 rounded-full" />}
              <span className="hidden max-w-[9rem] truncate text-sm font-extrabold sm:block">{user.login}</span>
              <button
                type="button"
                onClick={() => {
                  session.signOut()
                  onGo('/studio')
                }}
                className="h-8 rounded-full bg-ink/5 px-3 text-xs font-extrabold text-ink-soft transition-colors hover:bg-ink/10 hover:text-ink"
              >
                {t.signOut[lang]}
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="relative min-h-0 flex-1">{body}</main>
    </div>
  )
}

/**
 * Waiting for GitHub: the code to type on github.com, a button that copies it and opens the page,
 * and a note that this tab carries on by itself once the person approves.
 */
function DeviceCodeCard({ code, lang, onCancel }: { code: DeviceCode; lang: Lang; onCancel: () => void }) {
  const [copied, setCopied] = useState(false)
  const go = async () => {
    try {
      await navigator.clipboard.writeText(code.userCode)
      setCopied(true)
    } catch {
      // No clipboard permission: the code is on screen to type.
    }
    window.open(code.verificationUri, '_blank', 'noopener,noreferrer')
  }
  return (
    <div className={`${glass} w-[min(30rem,100%)] p-6 text-center md:p-8`} aria-live="polite">
      <p className="text-4xl" aria-hidden="true">🔐</p>
      <h1 className="mt-3 text-xl leading-tight font-extrabold">{t.deviceTitle[lang]}</h1>
      <p className="mt-2 text-[15px] leading-snug text-ink-soft">{t.deviceLead[lang]}</p>
      <p className="mt-5 font-mono text-4xl font-extrabold tracking-[0.18em] text-ink select-all">{code.userCode}</p>
      <button
        type="button"
        onClick={go}
        className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-extrabold text-white transition-transform active:scale-[0.97]"
      >
        <GitHubMark /> {copied ? t.deviceCopied[lang] : t.deviceOpen[lang]}
      </button>
      <p className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-ink-soft">
        <span className="size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden="true" />
        {t.deviceWaiting[lang]}
      </p>
      <button type="button" onClick={onCancel} className="mt-3 h-8 rounded-full px-3 text-xs font-extrabold text-ink-soft hover:bg-ink/5 hover:text-ink">
        {t.cancel[lang]}
      </button>
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center overflow-y-auto p-4">{children}</div>
}

/**
 * Two ways in without a repo: the built-in example, and "Open a saved presentation", a file picker
 * for the JSON the workspace downloads.
 */
function OpenFile({ lang, onOpen, error, onExample }: { lang: Lang; onOpen: (file: File) => void; error: boolean; onExample: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={onExample}
        title={t.exampleLead[lang]}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent/10 px-4 text-xs font-extrabold text-accent transition-colors hover:bg-accent/20"
      >
        <span aria-hidden="true">✨</span> {t.example[lang]}
      </button>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/80 px-4 text-xs font-extrabold text-ink transition-colors hover:bg-white"
      >
        <span aria-hidden="true">📂</span> {t.openFile[lang]}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) onOpen(picked)
          e.target.value = ''
        }}
      />
      {error && (
        <p className="w-full text-xs font-bold text-[#a12d2d]" role="alert">
          {t.badFile[lang]}
        </p>
      )}
    </div>
  )
}

function GitHubMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
