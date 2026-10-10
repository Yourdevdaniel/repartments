/**
 * How the system works, as a show: every floor is a scene the analysis wrote (a request going
 * through the system, an AI agent choosing its tools, a background job), played on the `Theater`.
 * The script is editable, so the presenter can use the client's own words.
 */
import { useMemo, useState } from 'react'
import type { ArchitectureModel } from '../../shared/studio'
import { actorKey, applyEdits, buildTour, type ScriptEdits } from '../../scene/tour'
import type { Lang } from '../../ui/roles'
import { scriptFlows } from './intro'
import { ScriptEditor } from './ScriptEditor'
import { Theater } from './Theater'

const w = {
  scenes: { en: 'Scenes', pt: 'Cenas' },
  scenesLead: { en: 'Each floor is one scene. Step inside to watch it.', pt: 'Cada andar é uma cena. Entre para assistir.' },
  sceneOf: (n: number, of: number) => ({ en: `Scene ${n} of ${of}`, pt: `Cena ${n} de ${of}` }),
  edit: { en: 'Edit script', pt: 'Editar roteiro' },
  none: { en: 'No scenes to show: every scene is hidden in the script.', pt: 'Nenhuma cena para mostrar: todas estão ocultas no roteiro.' },
  noAgent: {
    en: 'No AI agent found in this repo, so there is no "how the AI decides" scene. The studio recognises OpenAI, Anthropic, Google, Mistral, Cohere, Groq and Ollama SDKs, LangChain/LangGraph, LlamaIndex, CrewAI, the OpenAI Agents SDK and the Vercel AI SDK.',
    pt: 'Nenhum agente de IA encontrado neste repositório, então não há a cena "como a IA decide". O estúdio reconhece os SDKs da OpenAI, Anthropic, Google, Mistral, Cohere, Groq e Ollama, LangChain/LangGraph, LlamaIndex, CrewAI, o OpenAI Agents SDK e o Vercel AI SDK.',
  },
  note: {
    en: 'Generated from the code: names come from folders and files, steps from imports, routes and the AI calls found.',
    pt: 'Gerado a partir do código: os nomes vêm das pastas e arquivos, os passos dos imports, rotas e chamadas de IA encontrados.',
  },
}

export function PresentTab({ model, edits, onEdits, lang }: { model: ArchitectureModel; edits: ScriptEdits; onEdits: (e: ScriptEdits) => void; lang: Lang }) {
  const generated = useMemo(() => scriptFlows(model), [model])
  const flows = useMemo(() => applyEdits(generated, edits).filter((f) => !edits.hidden.includes(f.id)), [generated, edits])
  const flats = useMemo(() => flows.map((f) => buildTour(f, lang)), [flows, lang])
  const [editing, setEditing] = useState(false)

  return (
    <>
      <Theater
        flows={flows}
        flats={flats}
        owner={model.repo.owner}
        lang={lang}
        sceneOf={w.sceneOf}
        intro={
          <>
            <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">
              {model.repo.owner}/{model.repo.name}
            </p>
            <p className="mt-1 text-sm leading-snug">{model.summary[lang]}</p>
            {!model.agents.length && <p className="mt-2 rounded-xl bg-ink/5 px-3 py-2 text-xs leading-snug text-ink-soft">{w.noAgent[lang]}</p>}
          </>
        }
        listTitle={w.scenes}
        listLead={w.scenesLead}
        tools={
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-9 rounded-full bg-ink/5 px-3 text-xs font-extrabold text-ink-soft transition-colors hover:bg-ink/10 hover:text-ink max-lg:h-10 max-lg:bg-white/90 max-lg:shadow"
          >
            ✏️ {w.edit[lang]}
          </button>
        }
        note={w.note}
        empty={w.none}
        keysOff={editing}
      />
      {editing && <ScriptEditor flows={generated} edits={edits} onChange={onEdits} lang={lang} onClose={() => setEditing(false)} keyOf={actorKey} />}
    </>
  )
}
