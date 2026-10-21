import { useEffect, useId, useMemo, useState } from 'react'
import type { ArchitectureModel, CommitDetail, Churn } from '../../shared/studio'
import type { L, Lang } from '../../ui/roles'
import { glass } from '../../ui/kit'
import { componentChurn, heatColor, heatRatio, touchedComponents, type ChurnTotals } from './heat'
import { BAND_NAME, BAND_TINT, EXTERNAL_KIND, fitText, filesLabel, numberText, wrapLabel } from './labels'
import { externalKey, layoutMap, neighboursOf, type MapEdge } from './layout'
import { MapDetail } from './MapDetail'
import { PanZoom } from './PanZoom'

type Overlay = 'none' | 'heat' | 'commit'

const INK = '#23263a'
const INK_SOFT = '#5b6078'
const ACCENT = '#2f8fe6'
const EDGE = 'rgba(35,38,58,0.25)'

/**
 * The architecture as a map for people who don't read code: bands per layer, a card per part, the
 * arrows between them, and two overlays (where the work concentrates, and what one commit touched).
 * Hovering a part lights up what it is joined to; clicking it opens its details on the side.
 */
export function MapTab({
  model,
  lang,
  churn,
  onLoadChurn,
  churnLoading,
  commit,
}: {
  model: ArchitectureModel
  lang: Lang
  /** Churn per file over recent commits; when present, components can be coloured by it. */
  churn: Churn | null
  /** Asks the page to compute churn (it calls the API and passes `churn` back down). */
  onLoadChurn: () => void
  churnLoading: boolean
  /** A commit picked in the Commits tab: the components its files belong to get highlighted. */
  commit: CommitDetail | null
}) {
  const t = (x: L) => x[lang]
  const uid = useId().replace(/:/g, '')
  const [showTests, setShowTests] = useState(false)
  // Coming from the Commits tab with a commit open (or the heat computed), start by showing it.
  const [overlay, setOverlay] = useState<Overlay>(() => (commit ? 'commit' : churn ? 'heat' : 'none'))
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [openAgent, setOpenAgent] = useState<string | null>(null)

  const layout = useMemo(() => layoutMap(model, { showTests }), [model, showTests])
  const visible = useMemo(() => model.components.filter((c) => showTests || c.layer !== 'tests'), [model, showTests])
  const heat = useMemo(() => (churn ? componentChurn(model.components, churn.files) : null), [model, churn])
  const heatMax = useMemo(() => (heat ? Math.max(0, ...[...heat.values()].map((v) => v.total)) : 0), [heat])
  const touched = useMemo(() => (commit && overlay === 'commit' ? touchedComponents(model.components, commit.files) : null), [model, commit, overlay])

  const focus = hovered ?? focused ?? selected
  const lit = focus ? neighboursOf(focus, layout.edges) : null
  const selectedComp = selected ? (visible.find((c) => c.id === selected) ?? null) : null

  // Escape closes the details, from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setOpenAgent(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const select = (key: string) => {
    setSelected(key)
    setOpenAgent(null)
  }

  const opacityOf = (key: string) => {
    if (lit && !lit.has(key)) return 0.25
    if (touched && !touched.has(key)) return 0.35
    return 1
  }

  const edgeOf = (e: MapEdge) => {
    const hot = focus !== null && (e.from === focus || e.to === focus)
    if (hot) return { stroke: ACCENT, opacity: 1, marker: `url(#hi-${uid})` }
    return { stroke: EDGE, opacity: lit ? 0.3 : 1, marker: `url(#base-${uid})` }
  }

  const counts = [
    { n: visible.length, en: ['part', 'parts'], pt: ['parte', 'partes'] },
    { n: layout.edges.filter((e) => e.kind === 'dependency').length, en: ['connection', 'connections'], pt: ['conexão', 'conexões'] },
    { n: model.endpoints.length, en: ['route', 'routes'], pt: ['rota', 'rotas'] },
    { n: model.agents.length, en: ['agent', 'agents'], pt: ['agente', 'agentes'] },
  ]

  const overlays: { key: Overlay; label: L }[] = [
    { key: 'none', label: { en: 'None', pt: 'Nenhum' } },
    { key: 'heat', label: { en: 'Commit heat', pt: 'Calor dos commits' } },
    { key: 'commit', label: { en: 'Selected commit', pt: 'Commit selecionado' } },
  ]

  const chip =
    'rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45'

  return (
    <div className="flex flex-col gap-5">
      <header className={`${glass} flex flex-col gap-3 p-5`}>
        <p className="text-[15px] leading-relaxed text-ink">{model.summary[lang]}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
          {counts.map((c) => (
            <li key={c.en[1]}>
              <strong className="text-ink">{numberText(c.n, lang)}</strong> {lang === 'en' ? c.en[c.n === 1 ? 0 : 1] : c.pt[c.n === 1 ? 0 : 1]}
            </li>
          ))}
        </ul>
        {model.stats.truncated && (
          <p className="text-[12.5px] text-ink-soft">
            {t({
              en: `The repository is too big to read whole, so the map covers ${numberText(model.stats.analyzed, lang)} of ${numberText(model.stats.files, lang)} files.`,
              pt: `O repositório é grande demais para ser lido por inteiro, então o mapa cobre ${numberText(model.stats.analyzed, lang)} de ${numberText(model.stats.files, lang)} arquivos.`,
            })}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t({ en: 'Highlight', pt: 'Destaque' })} className="flex flex-wrap gap-1 rounded-full bg-white/70 p-1">
          {overlays.map((o) => {
            const disabled = o.key === 'commit' && !commit
            const on = overlay === o.key
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => setOverlay(o.key)}
                className={`${chip} ${on ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
              >
                {t(o.label)}
              </button>
            )
          })}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-ink-soft">
          <input type="checkbox" checked={showTests} onChange={(e) => setShowTests(e.target.checked)} className="size-4 accent-[#2f8fe6]" />
          {t({ en: 'Show tests', pt: 'Mostrar testes' })}
        </label>
      </div>

      {overlay === 'heat' && !churn && (
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-soft">
          <button
            type="button"
            onClick={onLoadChurn}
            disabled={churnLoading}
            className="rounded-full bg-ink px-4 py-2 font-bold text-white hover:bg-ink/85 disabled:opacity-60"
          >
            {t({ en: 'Compute', pt: 'Calcular' })}
          </button>
          {churnLoading ? (
            <span role="status">{t({ en: 'Counting the recent changes…', pt: 'Contando as mudanças recentes…' })}</span>
          ) : (
            <span>{t({ en: 'See where the code changes most often.', pt: 'Veja onde o código mais muda.' })}</span>
          )}
        </div>
      )}

      {overlay === 'heat' && churn && (
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-soft">
          <span>{t({ en: 'less', pt: 'menos' })}</span>
          <span
            aria-hidden="true"
            className="h-2 w-40 rounded-full"
            style={{ background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }}
          />
          <span>{t({ en: 'more', pt: 'mais' })}</span>
          <span>· {t({ en: `last ${numberText(churn.commits, lang)} commits`, pt: `últimos ${numberText(churn.commits, lang)} commits` })}</span>
        </div>
      )}

      {overlay === 'commit' && !commit && (
        <p className="text-[13px] text-ink-soft">{t({ en: 'Pick a commit in the Commits tab.', pt: 'Escolha um commit na aba Commits.' })}</p>
      )}
      {overlay === 'commit' && commit && (
        <p className="text-[13px] text-ink-soft">
          {t({ en: 'Showing the commit: ', pt: 'Mostrando o commit: ' })}
          <span className="font-bold text-ink">{fitText(commit.headline, 90)}</span>
        </p>
      )}

      {visible.length === 0 || layout.bands.length === 0 ? (
        <div className={`${glass} p-8 text-center text-[15px] text-ink-soft`}>
          {t({
            en: "We haven't found any parts in this project to draw yet.",
            pt: 'Ainda não encontramos partes neste projeto para desenhar.',
          })}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <PanZoom
            width={layout.width}
            height={layout.height}
            label={t({ en: 'Architecture map', pt: 'Mapa da arquitetura' })}
            lang={lang}
            className={`${glass} h-[min(68vh,640px)] min-h-[420px]`}
          >
            <defs>
              <marker id={`base-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={9} markerHeight={9} markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill="rgba(35,38,58,0.45)" />
              </marker>
              <marker id={`hi-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={9} markerHeight={9} markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
              </marker>
            </defs>

            {layout.bands.map((b) => {
              const name = BAND_NAME[b.key][lang]
              const lines = wrapLabel(name, 16)
              const cy = b.top + b.height / 2
              return (
                <g key={b.key}>
                  <rect x={0} y={b.top} width={layout.width} height={b.height} rx={22} fill={BAND_TINT[b.key]} />
                  <text x={24} y={cy} fontSize={13} fontWeight={800} fill={INK_SOFT} dominantBaseline="central" fontFamily="Nunito, system-ui, sans-serif">
                    {lines.map((line, i) => (
                      <tspan key={i} x={24} y={cy + (i - (lines.length - 1) / 2) * 17}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            })}

            {layout.edges.map((e, i) => {
              const style = edgeOf(e)
              return (
                <path
                  key={`e${i}`}
                  d={e.d}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={e.width}
                  strokeLinecap="round"
                  opacity={style.opacity}
                  markerEnd={style.marker}
                />
              )
            })}

            {model.externals.map((x) => {
              const key = externalKey(x.id)
              const box = layout.boxes[key]
              if (!box) return null
              const kind = EXTERNAL_KIND[x.kind]
              return (
                <g key={key} role="img" aria-label={`${kind.name[lang]}: ${x.name}`} opacity={opacityOf(key)}>
                  <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.h / 2} fill="#ffffff" stroke="rgba(35,38,58,0.12)" />
                  <text x={box.x + box.w / 2} y={box.y + box.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill={INK} fontFamily="Nunito, system-ui, sans-serif">
                    {`${kind.icon} ${fitText(x.name, 18)}`}
                  </text>
                </g>
              )
            })}

            {visible.map((c) => {
              const box = layout.boxes[c.id]
              if (!box) return null
              const { x, y, w, h } = box
              const agentCount = model.agents.filter((a) => a.component === c.id).length
              const ratio = overlay === 'heat' && heat && churn ? heatRatio(heat.get(c.id)?.total ?? 0, heatMax) : 0
              const fill = ratio > 0 ? heatColor(ratio) : '#ffffff'
              const darkText = ratio > 0.6
              const ink = darkText ? '#ffffff' : INK
              const soft = darkText ? 'rgba(255,255,255,0.85)' : INK_SOFT
              const touchedCount = touched?.get(c.id) ?? 0
              const isSelected = selected === c.id
              const isFocused = focused === c.id
              const ring = isSelected || isFocused || touchedCount > 0 ? ACCENT : 'rgba(35,38,58,0.12)'
              const ringWidth = isSelected || isFocused ? 2.5 : touchedCount > 0 ? 2 : 1
              const label = [
                c.name,
                BAND_NAME[c.layer][lang],
                filesLabel(c.files, lang),
                c.entry ? t({ en: 'entry point', pt: 'ponto de entrada' }) : '',
                agentCount ? t({ en: 'has an agent', pt: 'tem um agente' }) : '',
              ]
                .filter(Boolean)
                .join('. ')
              const sub = [filesLabel(c.files, lang), c.tech[0]].filter(Boolean).join(' · ')
              const nameMax = c.entry ? 17 : 19
              return (
                <g
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={isSelected}
                  opacity={opacityOf(c.id)}
                  onClick={() => select(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      select(c.id)
                    }
                  }}
                  onMouseEnter={() => setHovered(c.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setFocused(c.id)}
                  onBlur={() => setFocused(null)}
                  className="cursor-pointer outline-none"
                >
                  <rect x={x} y={y} width={w} height={h} rx={18} fill={fill} stroke={ring} strokeWidth={ringWidth} />
                  {c.entry && <circle cx={x + 16} cy={y + 22} r={4} fill="#3f9c8f" aria-hidden="true" />}
                  <text x={x + (c.entry ? 28 : 16)} y={y + 27} fontSize={14} fontWeight={800} fill={ink} fontFamily="Nunito, system-ui, sans-serif">
                    {fitText(c.name, nameMax)}
                  </text>
                  <text x={x + 16} y={y + 47} fontSize={11.5} fill={soft} fontFamily="Nunito, system-ui, sans-serif">
                    {fitText(sub, 22)}
                  </text>
                  {agentCount > 0 && (
                    <text x={x + w - 14} y={y + h - 13} textAnchor="end" fontSize={13} aria-hidden="true">
                      🤖
                    </text>
                  )}
                  {touchedCount > 0 && (
                    <g transform={`translate(${x + w - 8} ${y - 9})`} aria-hidden="true">
                      <rect x={-40} y={0} width={40} height={20} rx={10} fill={ACCENT} />
                      <text x={-20} y={10} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={800} fill="#ffffff">
                        {String(touchedCount)}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </PanZoom>

          {selectedComp ? (
            <MapDetail
              model={model}
              lang={lang}
              component={selectedComp}
              churn={heat ? (heat.get(selectedComp.id) ?? ZERO) : null}
              openAgent={openAgent}
              onToggleAgent={(id) => setOpenAgent((cur) => (cur === id ? null : id))}
              onSelect={select}
              onClose={() => {
                setSelected(null)
                setOpenAgent(null)
              }}
              className="max-lg:fixed max-lg:inset-x-3 max-lg:bottom-3 max-lg:z-40 max-lg:max-h-[72vh] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
            />
          ) : (
            <p className={`${glass} hidden self-start p-5 text-[13.5px] leading-relaxed text-ink-soft lg:block`}>
              {t({ en: 'Click a part to see what it does and what it connects to.', pt: 'Clique em uma peça para ver o que ela faz e com o que se conecta.' })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const ZERO: ChurnTotals = { additions: 0, deletions: 0, total: 0 }
