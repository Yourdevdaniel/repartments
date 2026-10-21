import type { ArchitectureModel, Component } from '../../shared/studio'
import type { Lang } from '../../ui/roles'
import { glass } from '../../ui/kit'
import { AgentGraph } from './AgentGraph'
import type { ChurnTotals } from './heat'
import { BAND_NAME, EXTERNAL_KIND, filesLabel, numberText } from './labels'

/**
 * The side panel of a selected part: what it does, what it talks to, its endpoints and agents, and
 * its recent churn. Stays calm: short sections, every name clickable to jump to a related part.
 */
export function MapDetail({
  model,
  lang,
  component: c,
  churn,
  openAgent,
  onToggleAgent,
  onSelect,
  onClose,
  className = '',
}: {
  model: ArchitectureModel
  lang: Lang
  component: Component
  /** Churn of this part over the commits looked at; null until the page computes it. */
  churn: ChurnTotals | null
  /** The id of the agent whose decision graph is open, if any. */
  openAgent: string | null
  onToggleAgent: (agentId: string) => void
  onSelect: (id: string) => void
  onClose: () => void
  className?: string
}) {
  const t = (en: string, pt: string) => (lang === 'en' ? en : pt)
  const byId = new Map(model.components.map((x) => [x.id, x]))
  const uses = model.dependencies.filter((d) => d.from === c.id && byId.has(d.to)).map((d) => d.to)
  const usedBy = model.dependencies.filter((d) => d.to === c.id && byId.has(d.from)).map((d) => d.from)
  const services = model.externals.filter((x) => x.usedBy.includes(c.id))
  const endpoints = model.endpoints.filter((e) => e.component === c.id)
  const agents = model.agents.filter((a) => a.component === c.id)
  const heading = `${c.id}-title`

  const link = (id: string) => (
    <li key={id}>
      <button
        type="button"
        onClick={() => onSelect(id)}
        className="rounded-full border border-ink/10 bg-white px-3 py-1 text-[12.5px] font-bold text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        {byId.get(id)?.name}
      </button>
    </li>
  )

  return (
    <aside aria-labelledby={heading} className={`${glass} flex flex-col gap-5 overflow-y-auto p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold tracking-wide text-accent uppercase">{BAND_NAME[c.layer][lang]}</p>
          <h2 id={heading} className="mt-0.5 text-lg leading-tight font-extrabold text-ink">
            {c.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close details', 'Fechar detalhes')}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5 text-base font-extrabold text-ink-soft hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-accent"
        >
          ×
        </button>
      </div>

      <p className="text-[13.5px] leading-relaxed text-ink">{c.summary[lang]}</p>

      <div className="flex flex-col gap-1.5">
        <p className="text-[12px] font-bold text-ink-soft">{t('Folder', 'Pasta')}</p>
        <code className="font-mono text-[12px] break-all text-ink">{c.path || t('Project root', 'Raiz do projeto')}</code>
        {c.direct && <p className="text-[12px] text-ink-soft">{t('Only the files directly inside this folder.', 'Só os arquivos diretamente dentro desta pasta.')}</p>}
      </div>

      {c.tech.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('Technologies', 'Tecnologias')}>
          {c.tech.map((tech) => (
            <li key={tech} className="rounded-full bg-accent/10 px-2.5 py-1 text-[12px] font-bold text-accent">
              {tech}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[13px] text-ink-soft">
        {filesLabel(c.files, lang)} · {numberText(c.lines, lang)} {t('lines', 'linhas')}
        {c.entry && <span className="ml-2 font-bold text-[#3f9c8f]">· {t('starts here', 'a execução começa aqui')}</span>}
      </p>

      {churn && (
        <div className="rounded-2xl bg-white/70 px-3.5 py-3 text-[13px] text-ink">
          <p className="font-bold">{t('Recent changes', 'Mudanças recentes')}</p>
          <p className="text-ink-soft">
            <span className="font-bold text-[#2e7d4f]">+{numberText(churn.additions, lang)}</span>{' '}
            <span className="font-bold text-[#b42318]">−{numberText(churn.deletions, lang)}</span>{' '}
            {t('lines in the commits looked at', 'linhas nos commits analisados')}
          </p>
        </div>
      )}

      {(uses.length > 0 || services.length > 0) && (
        <section aria-label={t('Uses', 'Usa')} className="flex flex-col gap-2">
          <h3 className="text-[12px] font-bold text-ink-soft">{t('Uses', 'Usa')}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {uses.map(link)}
            {services.map((x) => (
              <li key={x.id} className="rounded-full border border-ink/10 px-3 py-1 text-[12.5px] font-bold text-ink-soft">
                {EXTERNAL_KIND[x.kind].icon} {x.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {usedBy.length > 0 && (
        <section aria-label={t('Used by', 'É usado por')} className="flex flex-col gap-2">
          <h3 className="text-[12px] font-bold text-ink-soft">{t('Used by', 'É usado por')}</h3>
          <ul className="flex flex-wrap gap-1.5">{usedBy.map(link)}</ul>
        </section>
      )}

      {endpoints.length > 0 && (
        <section aria-label={t('Endpoints', 'Rotas')} className="flex flex-col gap-2">
          <h3 className="text-[12px] font-bold text-ink-soft">{t('Endpoints', 'Rotas')}</h3>
          <ul className="flex flex-col gap-1.5">
            {endpoints.map((e) => (
              <li key={`${e.method} ${e.path} ${e.file}:${e.line}`} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="shrink-0 rounded-md bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">{e.method}</span>
                <code className="min-w-0 break-all font-mono text-ink">{e.path}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {agents.length > 0 && (
        <section aria-label={t('Agents', 'Agentes')} className="flex flex-col gap-3">
          <h3 className="text-[12px] font-bold text-ink-soft">{t('Agents', 'Agentes')}</h3>
          {agents.map((a) => {
            const open = openAgent === a.id
            return (
              <div key={a.id} className="flex flex-col gap-3">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => onToggleAgent(a.id)}
                  className="flex items-center gap-2 self-start rounded-full bg-ink px-3.5 py-2 text-[13px] font-bold text-white hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span aria-hidden="true">🤖</span>
                  {open ? t('Hide how it decides', 'Ocultar como decide') : t('See how it decides', 'Ver como decide')}
                </button>
                {open && <AgentGraph agent={a} lang={lang} />}
              </div>
            )
          })}
        </section>
      )}
    </aside>
  )
}
