import { useId, useMemo, useState } from 'react'
import type { Agent } from '../../shared/studio'
import type { Lang } from '../../ui/roles'
import { layoutAgent, type PlacedNode } from './agentLayout'
import { AGENT_KIND_ICON, fitText, wrapLabel } from './labels'
import { PanZoom } from './PanZoom'

const INK = '#23263a'
const INK_SOFT = '#5b6078'
const ARROW = '#8a93b0'

/** A small rounded tag: provider, model, framework. */
function Chip({ children, mono = false }: { children: string; mono?: boolean }) {
  return (
    <span className={`rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[12px] font-bold text-ink-soft ${mono ? 'font-mono' : ''}`}>
      {children}
    </span>
  )
}

/**
 * Draws one box of the decision graph. The shape says what kind of step it is, so a non-technical
 * reader can tell a question (diamond) from an action (tool) at a glance.
 */
function NodeShape({ placed }: { placed: PlacedNode }) {
  const { node, box } = placed
  const { x, y, w, h } = box
  const cx = x + w / 2
  const cy = y + h / 2
  const icon = AGENT_KIND_ICON[node.kind]
  const lines = wrapLabel(node.label, node.kind === 'decision' ? 22 : 26)
  const first = icon ? `${icon} ${lines[0]}` : lines[0]
  const texts = [first, ...lines.slice(1)]
  const top = cy - ((texts.length - 1) * 16) / 2 + 4.5
  const onDark = node.kind === 'start' || node.kind === 'end'

  let shape
  if (node.kind === 'decision') {
    shape = <polygon points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} fill="#fff4d6" stroke="#e0a526" strokeWidth={1.5} />
  } else if (node.kind === 'start') {
    shape = <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#2f8fe6" />
  } else if (node.kind === 'end') {
    shape = <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#3f9c8f" />
  } else if (node.kind === 'llm') {
    shape = <rect x={x} y={y} width={w} height={h} rx={16} fill="#f3e6fb" stroke="#b59be6" strokeWidth={1.5} />
  } else if (node.kind === 'human') {
    shape = <rect x={x} y={y} width={w} height={h} rx={16} fill="#fdebe3" stroke="#f0a58a" strokeWidth={1.5} />
  } else if (node.kind === 'instructions') {
    shape = <rect x={x} y={y} width={w} height={h} rx={16} fill="#ffffff" stroke="#9aa3bd" strokeWidth={1.5} strokeDasharray="5 4" />
  } else {
    shape = <rect x={x} y={y} width={w} height={h} rx={16} fill="#ffffff" stroke="#c9d4ea" strokeWidth={1.5} />
  }

  return (
    <g>
      <title>{node.file ? `${node.label} (${node.file})` : node.label}</title>
      {shape}
      <text textAnchor="middle" fontSize={13} fontWeight={700} fill={onDark ? '#ffffff' : INK} fontFamily="Nunito, system-ui, sans-serif">
        {texts.map((line, i) => (
          <tspan key={i} x={cx} y={top + i * 16}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

/**
 * An agent's decision graph as a top-down flowchart, with its name, the model it runs on, its
 * instructions and the tools it may call. Everything is text, so it reads without zooming in.
 */
export function AgentGraph({ agent, lang }: { agent: Agent; lang: Lang }) {
  const id = useId().replace(/:/g, '')
  const layout = useMemo(() => layoutAgent(agent.graph), [agent.graph])
  const [more, setMore] = useState(false)
  const t = (en: string, pt: string) => (lang === 'en' ? en : pt)
  const longInstructions = (agent.instructions?.length ?? 0) > 200
  const arrow = `arrow-${id}`
  const loopArrow = `loop-${id}`

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 id={`${id}-title`} className="text-base leading-snug font-extrabold text-ink">
          {agent.name}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <Chip>{agent.provider}</Chip>
          {agent.model && <Chip mono>{agent.model}</Chip>}
          {agent.framework && <Chip>{agent.framework}</Chip>}
          {agent.loop && <Chip>{t('Loops until done', 'Repete até terminar')}</Chip>}
        </div>
      </div>

      {agent.instructions && (
        <figure className="flex flex-col gap-1">
          <figcaption className="text-[12px] font-bold tracking-wide text-ink-soft uppercase">
            {t('Instructions', 'Instruções')}
          </figcaption>
          <blockquote className="rounded-2xl border-l-4 border-accent/50 bg-white/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-soft italic">
            <p className={more ? '' : 'line-clamp-4'}>{agent.instructions}</p>
          </blockquote>
          {longInstructions && (
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((m) => !m)}
              className="self-start rounded-full px-2 py-1 text-[12px] font-bold text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {more ? t('Show less', 'Ver menos') : t('Show more', 'Ver mais')}
            </button>
          )}
        </figure>
      )}

      {agent.tools.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[12px] font-bold tracking-wide text-ink-soft uppercase">{t('Tools', 'Ferramentas')}</h4>
          <ul className="flex flex-col gap-1.5">
            {agent.tools.map((tool) => (
              <li key={tool.name} className="flex gap-2 text-[13px] leading-snug text-ink">
                <span aria-hidden="true">🛠️</span>
                <span>
                  <code className="font-mono text-[12px] font-bold text-ink">{tool.name}</code>
                  {tool.description && <span className="text-ink-soft"> · {tool.description}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="text-[12px] font-bold tracking-wide text-ink-soft uppercase">{t('How it decides', 'Como decide')}</h4>
        {!agent.graph.explicit && (
          <p className="text-[12px] text-ink-soft">
            {t('Drawn from the tool loop in the code.', 'Desenhado a partir do laço de ferramentas do código.')}
          </p>
        )}
        {layout.nodes.length === 0 ? (
          <p className="rounded-2xl bg-white/70 px-3 py-4 text-center text-[13px] text-ink-soft">
            {t('No steps were found for this agent.', 'Não encontramos etapas para este agente.')}
          </p>
        ) : (
          <PanZoom
            width={layout.width}
            height={layout.height}
            label={t('Decision graph', 'Grafo de decisões')}
            lang={lang}
            className="glass h-[min(60vh,480px)] min-h-[300px]"
          >
            <defs>
              <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={8} markerHeight={8} markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill={ARROW} />
              </marker>
              <marker id={loopArrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={8} markerHeight={8} markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill={ARROW} />
              </marker>
            </defs>
            {layout.links.map((r, i) => (
              <path
                key={`l${i}`}
                d={r.d}
                fill="none"
                stroke={ARROW}
                strokeWidth={1.6}
                strokeDasharray={r.loop ? '6 5' : undefined}
                markerEnd={`url(#${r.loop ? loopArrow : arrow})`}
              />
            ))}
            {layout.links.map((r, i) =>
              r.label && r.condition ? (
                <g key={`c${i}`} transform={`translate(${r.label.x} ${r.label.y})`}>
                  <rect x={-(fitText(r.condition, 28).length * 3.4 + 8)} y={-10} width={fitText(r.condition, 28).length * 6.8 + 16} height={20} rx={10} fill="#ffffff" stroke="rgba(35,38,58,0.12)" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={12} fill={INK_SOFT} fontFamily="Nunito, system-ui, sans-serif">
                    {fitText(r.condition, 28)}
                  </text>
                </g>
              ) : null,
            )}
            {layout.nodes.map((p) => (
              <NodeShape key={p.node.id} placed={p} />
            ))}
          </PanZoom>
        )}
      </div>
    </section>
  )
}
