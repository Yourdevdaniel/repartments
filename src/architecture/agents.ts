/**
 * Finds the code that hands decisions to a language model and describes it: which model and provider,
 * what its instructions say, which tools it can call, and the shape of its decisions (the graph of a
 * LangGraph workflow when there is one, or the tool loop it runs otherwise).
 *
 * A file is agent code when it imports a model SDK or framework. Files that only define tools are
 * merged into the agent that imports them. Everything is read from the code's text, never run.
 */
import type { Agent, AgentLink, AgentNode, AgentTool } from '../shared/studio'
import { llmProviderOf, callsModel } from './externals'
import { basenameOf, clip, firstSentence, langOf, lineOf, stripComments, titleWords } from './text'

/** One file as the agent finder sees it. */
export type AgentFile = {
  path: string
  text: string
  /** Packages it imports. */
  packages: string[]
  /** Repo files it imports (resolved). */
  imports: string[]
}

/** A quoted string, single, double, template or Python triple-quoted. Groups 1–5, one per form. */
const PROMPT = /(?:[fr]?"""([\s\S]*?)"""|[fr]?'''([\s\S]*?)'''|`([^`]*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/

/** The value of a string pattern's groups (1–5, or 2–6 after a leading name group). */
function valueOf(m: RegExpExecArray, from: number): string | null {
  for (let i = from; i < from + 5; i++) if (m[i] !== undefined) return m[i]
  return null
}

/** A quoted string argument `key: 'x'` / `key="x"`, or null. */
function strArg(s: string, key: string): string | null {
  const re = new RegExp(`['"]?\\b${key}['"]?\\s*[:=]\\s*(?:'([^'\\n]*)'|"([^"\\n]*)"|\`([^\`]*)\`)`)
  const m = re.exec(s)
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null
}

const NAME_OK = /^[A-Za-z_][\w.-]{1,60}$/

/** The first sentence of a tool's description, clipped to 120 characters. */
function describe(text: string | null): string | null {
  if (!text) return null
  const s = firstSentence(text, 120)
  return s.length > 0 ? s : null
}

/** Tool definitions in one file's code: function schemas, decorators, LangChain/Vercel helpers and dispatchers. */
export function toolsIn(path: string, code: string): AgentTool[] {
  const line = lineOf(code)
  const found: AgentTool[] = []
  const add = (name: string | null, description: string | null, at: number) => {
    if (!name || !NAME_OK.test(name)) return
    found.push({ name, description: describe(description), file: path, line: line(at) })
  }
  const windowAt = (at: number, len: number) => code.slice(at, at + len)

  // {name: 'x', description: '…'}: OpenAI function tools, Anthropic tools, LangChain JS DynamicStructuredTool.
  for (const m of code.matchAll(/['"]?\bname['"]?\s*:\s*['"]([\w.-]{2,60})['"]\s*,\s*['"]?description['"]?\s*:\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`)/g)) {
    add(m[1], m[2] ?? m[3] ?? m[4] ?? null, m.index ?? 0)
  }
  // Python decorators: @tool, @function_tool, @mcp.tool(); the docstring's first line is the description.
  for (const m of code.matchAll(/@(?:\w+\.)?(tool|function_tool)\b(?:\([^)\n]*\))?[ \t]*\n\s*(?:async\s+)?def\s+(\w+)\s*\(/g)) {
    const after = code.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 400)
    const doc = /:\s*\n\s*(?:"""|''')\s*([^\n"']*)/.exec(after)
    add(m[2], doc ? doc[1] : null, m.index ?? 0)
  }
  // MCP servers: server.tool("name", "description", …)
  for (const m of code.matchAll(/\.tool\(\s*['"]([\w.-]+)['"]\s*,\s*['"]([^'"\n]*)['"]/g)) add(m[1], m[2], m.index ?? 0)
  // Tool(name=…), StructuredTool.from_function(…), tool(fn, {name, description}), DynamicTool(…)
  for (const m of code.matchAll(/\b(?:(?:Structured|Dynamic)?Tool(?:\.from_function)?|tool)\(/g)) {
    const win = windowAt((m.index ?? 0) + m[0].length, 400)
    add(strArg(win, 'name'), strArg(win, 'description'), m.index ?? 0)
  }
  // Vercel AI SDK: tools: { getLead: tool({ description: '…', … }) }
  for (const m of code.matchAll(/(\w+)\s*:\s*tool\(/g)) {
    const win = windowAt((m.index ?? 0) + m[0].length, 400)
    add(m[1], strArg(win, 'description'), m.index ?? 0)
  }

  // Dispatchers: `if name == "x"`, `case "x":` inside a tool-calling loop: tools without a description.
  const dispatch = /tool_calls|toolCalls|tool_use|function_call|tool_name|toolName/.test(code)
  if (dispatch) {
    for (const m of code.matchAll(/\b(?:if|elif|else if)\b[^\n]{0,80}?\b(?:tool_?name|name|function_name|fn_name)\s*={2,3}\s*['"]([\w.-]+)['"]/g)) add(m[1], null, m.index ?? 0)
    for (const m of code.matchAll(/\bcase\s+['"]([\w.-]+)['"]\s*:/g)) add(m[1], null, m.index ?? 0)
  }
  return found
}

/** Merges tool lists by name; a later copy fills in a description the first one lacked. */
function dedupeTools(tools: AgentTool[]): AgentTool[] {
  const byName = new Map<string, AgentTool>()
  for (const t of tools) {
    const have = byName.get(t.name)
    if (!have) byName.set(t.name, { ...t })
    else if (!have.description && t.description) have.description = t.description
  }
  return [...byName.values()]
}

/** The instructions of a file or of the files it imports: a system message, or a prompt variable. */
export function instructionsIn(code: string, files: { path: string; code: string }[]): string | null {
  const patterns: RegExp[] = [
    new RegExp(`['"]?role['"]?\\s*[:=]\\s*['"]system['"]\\s*,\\s*['"]?content['"]?\\s*[:=]\\s*${PROMPT.source}`),
    new RegExp(`\\b(?:system|instructions|system_prompt|system_message)\\s*[:=]\\s*${PROMPT.source}`),
    new RegExp(`SystemMessage\\(\\s*(?:content\\s*=\\s*)?${PROMPT.source}`),
    new RegExp(`\\(\\s*['"]system['"]\\s*,\\s*${PROMPT.source}`),
  ]
  const scopes = [code, ...files.map((f) => f.code)]
  for (const scope of scopes) {
    for (const re of patterns) {
      const m = re.exec(scope)
      const v = m ? valueOf(m, 1) : null
      if (v && v.trim().length >= 3) return tidy(v)
    }
  }
  // A variable named like a prompt, assigned a string: SYSTEM_PROMPT = """…""", instructions: str = "…"
  const variable = new RegExp(`\\b(\\w*(?:prompt|instruction|system)\\w*)\\s*(?::\\s*\\w+\\s*)?=\\s*${PROMPT.source}`, 'gi')
  const found: { name: string; value: string }[] = []
  for (const scope of scopes) {
    for (const m of scope.matchAll(variable)) {
      const v = valueOf(m, 2)
      if (v && v.trim().length >= 20) found.push({ name: m[1], value: v })
    }
  }
  found.sort((a, b) => rank(a.name) - rank(b.name))
  return found[0] ? tidy(found[0].value) : null
}

function rank(name: string): number {
  const n = name.toLowerCase()
  if (/system/.test(n) && /prompt|instruction|message/.test(n)) return 0
  if (/instruction|system/.test(n)) return 1
  return 2
}

/** Collapses a prompt to one clipped line: escapes and template placeholders go. */
function tidy(v: string): string {
  const flat = v
    .replace(/\\n/g, ' ')
    .replace(/\\"|\\'/g, '"')
    .replace(/\$\{[^}]*\}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
  return clip(flat, 400)
}

/** The model named in the code: `model: "gpt-4o"`, `model="…"`, `MODEL = "…"`. */
function modelIn(code: string): string | null {
  const m = /['"]?\bmodel(?:_name)?['"]?\s*[:=]\s*['"]([\w.:/-]+)['"]/i.exec(code)
  return m ? m[1] : null
}

/** The framework named by the code, from its imports and its vocabulary. */
function frameworkIn(code: string, pkgFramework: string | null): string | null {
  if (/StateGraph|add_node|addNode|from langgraph|langgraph/.test(code)) return 'LangGraph'
  if (pkgFramework) return pkgFramework
  if (/from agents import|OpenAI Agents|@function_tool/.test(code)) return 'OpenAI Agents SDK'
  if (/\bcrewai\b|from crewai/.test(code)) return 'CrewAI'
  if (/\bautogen\b/.test(code)) return 'AutoGen'
  return null
}

/** The agent's name: from `Agent(name=…)`, a class or variable with Agent/Bot/Assistant, or the file name. */
function nameIn(path: string, code: string): string {
  const named = /\bAgent\s*\(\s*\{?[^)]*?\bname\s*[:=]\s*['"]([^'"\n]{2,60})['"]/.exec(code)?.[1]
  if (named) return named.trim()
  const cls = /\b(?:class|const|let|var)\s+(\w*(?:Agent|Bot|Assistant)\w*)/.exec(code)?.[1]
  if (cls) return titleWords(cls.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ /g, '_'))
  return titleWords(basenameOf(path).replace(/\.[^.]+$/, ''))
}

/** The node name a LangGraph token stands for: START and END are the graph's own ends. */
function nodeToken(raw: string): string {
  const t = raw.replace(/^['"]|['"]$/g, '')
  if (t === 'START') return '__start__'
  if (t === 'END') return '__end__'
  return t
}

/** A LangGraph workflow written in code: its nodes and links, with a link's condition from the router's mapping. */
function explicitGraph(path: string, code: string): { nodes: AgentNode[]; links: AgentLink[] } | null {
  const line = lineOf(code)
  const nodes = new Map<string, AgentNode>()
  const links: AgentLink[] = []
  const linkSeen = new Set<string>()
  const addLink = (from: string, to: string, condition: string | null) => {
    const key = `${from}>${to}>${condition ?? ''}`
    if (linkSeen.has(key)) return
    linkSeen.add(key)
    links.push({ from, to, condition })
  }
  const kindOf = (id: string): AgentNode['kind'] => {
    if (id === '__start__') return 'start'
    if (id === '__end__') return 'end'
    if (/tool/i.test(id)) return 'tool'
    if (/model|llm|agent|chat/i.test(id)) return 'llm'
    return 'node'
  }
  const ensure = (id: string, at?: number) => {
    if (nodes.has(id)) return
    const label = id === '__start__' ? 'Início' : id === '__end__' ? 'Fim' : id
    nodes.set(id, { id, label, kind: kindOf(id), ...(at !== undefined ? { file: path, line: line(at) } : {}) })
  }

  for (const m of code.matchAll(/\.add_node\(\s*(?:['"]([\w.-]+)['"]|(\w+))/g)) ensure(m[1] ?? m[2], m.index)
  for (const m of code.matchAll(/\.addNode\(\s*['"]([\w.-]+)['"]/g)) ensure(m[1], m.index)
  const tok = `(START|END|['"][\\w.-]+['"]|\\w+)`
  for (const m of code.matchAll(new RegExp(`\\.(?:add_edge|addEdge)\\(\\s*${tok}\\s*,\\s*${tok}`, 'g'))) {
    const from = nodeToken(m[1])
    const to = nodeToken(m[2])
    ensure(from)
    ensure(to)
    addLink(from, to, null)
  }
  const entry = /set_entry_point\(\s*['"]?([\w.-]+)|setEntryPoint\(\s*['"]([\w.-]+)/.exec(code)
  if (entry) {
    const to = entry[1] ?? entry[2]
    ensure('__start__')
    ensure(to)
    addLink('__start__', to, null)
  }
  for (const m of code.matchAll(new RegExp(`\\.(?:add_conditional_edges|addConditionalEdges)\\(\\s*${tok}\\s*,\\s*\\w+\\s*(?:,\\s*(\\{[^}]*\\}|\\[[^\\]]*\\]))?`, 'g'))) {
    const from = nodeToken(m[1])
    ensure(from)
    const mapping = m[2] ?? ''
    if (!mapping) continue
    if (mapping.startsWith('{')) {
      for (const pair of mapping.matchAll(/['"]?([\w.-]+)['"]?\s*:\s*['"]?([\w.-]+)['"]?/g)) {
        const to = nodeToken(pair[2])
        ensure(to)
        addLink(from, to, pair[1])
      }
    } else {
      for (const item of mapping.matchAll(/['"]([\w.-]+)['"]|\b(START|END)\b/g)) {
        const to = nodeToken(item[1] ?? item[2])
        ensure(to)
        addLink(from, to, to === '__end__' ? 'fim' : to)
      }
    }
  }
  if (nodes.size === 0) return null
  return { nodes: [...nodes.values()], links }
}

/** Whether the directed links loop back on themselves. */
function hasCycle(links: AgentLink[]): boolean {
  const out = new Map<string, string[]>()
  for (const l of links) out.set(l.from, [...(out.get(l.from) ?? []), l.to])
  const state = new Map<string, 1 | 2>()
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return true
    if (state.get(n) === 2) return false
    state.set(n, 1)
    for (const to of out.get(n) ?? []) if (visit(to)) return true
    state.set(n, 2)
    return false
  }
  return [...out.keys()].some((n) => visit(n))
}

/** The flow the model follows when it's left to the tool loop: instructions, model, a decision, tools, back to the model. */
function inferredGraph(
  path: string,
  model: string | null,
  provider: string,
  instructions: string | null,
  tools: AgentTool[],
  loop: boolean,
  code: string,
  modelLine: number,
): { nodes: AgentNode[]; links: AgentLink[] } {
  const nodes: AgentNode[] = [{ id: 'start', label: 'Mensagem', kind: 'start' }]
  const links: AgentLink[] = []
  const link = (from: string, to: string, condition: string | null = null) => links.push({ from, to, condition })

  // Intent routers: `if intent == "refund"` makes a branch per value.
  const intents = [...new Set([...code.matchAll(/\b(?:intent|category|route|label|action)\s*={2,3}\s*['"]([\w-]+)['"]/g)].map((m) => m[1]))].slice(0, 4)
  // The path into the model: start → (intent branches) → instructions → model.
  let before: string[] = ['start']
  if (intents.length) {
    nodes.push({ id: 'intent', label: 'Qual é o pedido?', kind: 'decision' })
    link('start', 'intent')
    for (const v of intents) {
      nodes.push({ id: `route:${v}`, label: v, kind: 'node' })
      link('intent', `route:${v}`, v)
    }
    before = intents.map((v) => `route:${v}`)
  }
  let entry: string[] = before
  if (instructions) {
    nodes.push({ id: 'instructions', label: 'Instruções', kind: 'instructions' })
    for (const b of before) link(b, 'instructions')
    entry = ['instructions']
  }
  nodes.push({ id: 'llm', label: model ?? provider, kind: 'llm', file: path, line: modelLine })
  for (const b of entry) link(b, 'llm')

  if (tools.length) {
    nodes.push({ id: 'decision', label: 'Precisa de ferramenta?', kind: 'decision' })
    link('llm', 'decision')
    for (const t of tools) {
      const id = `tool:${t.name}`
      nodes.push({ id, label: t.name, kind: 'tool', file: t.file, line: t.line })
      link('decision', id, t.name)
      if (loop) link(id, 'llm')
    }
    nodes.push({ id: 'end', label: 'Resposta', kind: 'end' })
    link('decision', 'end', 'não')
  } else {
    nodes.push({ id: 'end', label: 'Resposta', kind: 'end' })
    link('llm', 'end')
  }
  return { nodes, links }
}

/** The file's first call to a model: where the agent's decision is made. */
function modelCallLine(code: string): number {
  const m = /\.(chat\.completions\.create|messages\.create|responses\.create|generate_content|invoke|ainvoke|create_completion|complete|chat)\(/.exec(code)
  return m ? lineOf(code)(m.index ?? 0) : 1
}

/**
 * The agents of a repo: one per file that calls a model. `componentOf` tells which part of the system
 * a file belongs to, so the agent can be placed on the map.
 */
export function agentsFrom(files: AgentFile[], componentOf: (path: string) => string): Agent[] {
  const codeOf = new Map<string, string>()
  for (const f of files) {
    const lang = langOf(f.path)
    if (!lang) continue
    codeOf.set(f.path, stripComments(f.text, lang === 'py' || lang === 'rb' ? 'hash' : 'slash'))
  }
  const toolsOf = new Map<string, AgentTool[]>()
  for (const f of files) {
    const code = codeOf.get(f.path)
    if (code !== undefined) toolsOf.set(f.path, toolsIn(f.path, code))
  }
  const byPath = new Map(files.map((f) => [f.path, f]))

  const agents: Agent[] = []
  for (const f of files) {
    if (!callsModel(f.packages)) continue
    const code = codeOf.get(f.path) ?? ''
    const llm = llmProviderOf(f.packages)
    const provider = llm?.provider ?? 'IA'

    // Tools: its own, plus those of tool-only files it imports.
    const imported = f.imports.map((p) => byPath.get(p)).filter((x): x is AgentFile => !!x)
    const merged: AgentTool[] = [...(toolsOf.get(f.path) ?? [])]
    for (const other of imported) if (!callsModel(other.packages)) merged.push(...(toolsOf.get(other.path) ?? []))
    const tools = dedupeTools(merged).slice(0, 30)

    // Instructions and model: this file first, then the files it imports (prompt modules).
    const scopes = imported.map((o) => ({ path: o.path, code: codeOf.get(o.path) ?? promptText(o) }))
    const promptFile = imported.map(promptText).find((t) => t.trim().length > 0)
    const instructions = instructionsIn(code, scopes.filter((s) => s.code)) ?? (promptFile ? tidy(promptFile) : null)
    const model = modelIn(code) ?? imported.map((o) => modelIn(codeOf.get(o.path) ?? '')).find((m) => m) ?? null

    const framework = frameworkIn(code, llm?.framework ?? null)
    const explicit = framework === 'LangGraph' ? explicitGraph(f.path, code) : null
    const loop =
      (/\b(while|for)\b/.test(code) && /tool_calls|toolCalls|stop_reason|finish_reason|tool_use|function_call|tool_result/.test(code)) ||
      framework === 'OpenAI Agents SDK' ||
      framework === 'LangGraph' ||
      (tools.length > 0 && /\bwhile\s*\(\s*true\b|\bwhile\s+True\b/.test(code))

    const graph = explicit
      ? { nodes: explicit.nodes, links: explicit.links, explicit: true }
      : { ...inferredGraph(f.path, model, provider, instructions, tools, loop, code, modelCallLine(code)), explicit: false }
    const looping = explicit ? hasCycle(explicit.links) : loop

    agents.push({
      id: f.path,
      name: nameIn(f.path, code),
      file: f.path,
      component: componentOf(f.path),
      provider,
      model,
      framework,
      instructions,
      tools: tools.map((t) => ({ name: t.name, description: t.description, file: t.file, line: t.line })),
      graph,
      loop: looping,
    })
  }
  return agents
}

/** A prompt file's whole text, when the file is a prompt (markdown or text under a prompt path). */
function promptText(f: AgentFile): string {
  return /\.(md|txt|prompt|jinja|j2|yaml|yml)$/i.test(f.path) && /prompt/i.test(f.path) ? f.text : ''
}
