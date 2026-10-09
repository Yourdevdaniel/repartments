import { describe, expect, it } from 'vitest'
import { agentsFrom, type AgentFile } from './agents'

const OPENAI_LOOP = `from openai import OpenAI

client = OpenAI()
MODEL = "gpt-4o-mini"
SYSTEM_PROMPT = """You are a sales assistant. Answer in Portuguese and never invent customer data."""

tools = [
    {"type": "function", "function": {"name": "search_leads", "description": "Find leads by company name.", "parameters": {}}},
    {"type": "function", "function": {"name": "add_note", "description": "Add a note to a lead. Keep it short.", "parameters": {}}},
]

def run(message):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": message}]
    while True:
        res = client.chat.completions.create(model=MODEL, messages=messages, tools=tools)
        msg = res.choices[0].message
        if not msg.tool_calls:
            return msg.content
        for call in msg.tool_calls:
            # call.function.name == "ignored_in_comment"
            if call.function.name == "search_leads":
                messages.append({"role": "tool", "content": "[]"})
            elif call.function.name == "add_note":
                messages.append({"role": "tool", "content": "ok"})
`

const LANGGRAPH = `from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")

def call_model(state):
    return {"messages": [llm.invoke(state["messages"])]}

def run_tool(state):
    return {"messages": []}

def should_continue(state):
    return "tools" if state["messages"][-1].tool_calls else "end"

graph = StateGraph(State)
graph.add_node("agent", call_model)
graph.add_node("tools", run_tool)
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
graph.add_edge("tools", "agent")
app = graph.compile()
`

const VERCEL = `import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function ask(prompt: string) {
  return generateText({
    model: openai('gpt-4o-mini'),
    system: 'Você é um assistente de vendas. Responda de forma curta.',
    prompt,
    tools: {
      getLead: tool({
        description: 'Get a lead by id.',
        parameters: {},
        execute: async ({ id }) => ({ id }),
      }),
      createTask: tool({
        description: 'Create a follow-up task for the team. Lots of detail here.',
        parameters: {},
      }),
    },
    maxSteps: 5,
  })
}
`

function file(path: string, text: string, packages: string[] = [], imports: string[] = []): AgentFile {
  return { path, text, packages, imports }
}

const comp = () => 'backend/agent'

describe('agentsFrom: a Python OpenAI function-calling loop', () => {
  const [agent] = agentsFrom([file('backend/agent/sales.py', OPENAI_LOOP, ['openai'])], comp)

  it('finds the provider, the model and the system prompt', () => {
    expect(agent.provider).toBe('OpenAI')
    expect(agent.framework).toBeNull()
    expect(agent.model).toBe('gpt-4o-mini')
    expect(agent.instructions).toBe('You are a sales assistant. Answer in Portuguese and never invent customer data.')
  })

  it('lists its tools with their first sentence, and the dispatcher names only once', () => {
    expect(agent.tools.map((t) => [t.name, t.description])).toEqual([
      ['search_leads', 'Find leads by company name.'],
      ['add_note', 'Add a note to a lead.'],
    ])
    expect(agent.tools[0].line).toBeGreaterThan(1)
  })

  it('is a loop, and draws the decision as a model, a decision and the tools back to the model', () => {
    expect(agent.loop).toBe(true)
    expect(agent.graph.explicit).toBe(false)
    const labels = agent.graph.nodes.map((n) => n.label)
    expect(labels).toEqual(expect.arrayContaining(['Mensagem', 'Instruções', 'gpt-4o-mini', 'Precisa de ferramenta?', 'search_leads', 'add_note', 'Resposta']))
    expect(agent.graph.links).toContainEqual({ from: 'tool:search_leads', to: 'llm', condition: null })
    expect(agent.graph.links).toContainEqual({ from: 'decision', to: 'tool:add_note', condition: 'add_note' })
  })

  it('names the agent after its file when the code gives no name', () => {
    expect(agent.name).toBe('Sales')
    expect(agent.component).toBe('backend/agent')
  })
})

describe('agentsFrom: a LangGraph graph with conditional edges', () => {
  const [agent] = agentsFrom([file('backend/agent/support_graph.py', LANGGRAPH, ['langgraph', 'langchain_openai'])], comp)

  it('reads the graph as written, with START and END and the mapping as conditions', () => {
    expect(agent.framework).toBe('LangGraph')
    expect(agent.provider).toBe('OpenAI')
    expect(agent.graph.explicit).toBe(true)
    expect(agent.graph.links).toEqual(
      expect.arrayContaining([
        { from: '__start__', to: 'agent', condition: null },
        { from: 'agent', to: 'tools', condition: 'tools' },
        { from: 'agent', to: '__end__', condition: 'end' },
        { from: 'tools', to: 'agent', condition: null },
      ]),
    )
    expect(agent.graph.nodes.find((n) => n.id === 'tools')?.kind).toBe('tool')
    expect(agent.graph.nodes.find((n) => n.id === '__end__')?.kind).toBe('end')
  })

  it('is a loop because its graph cycles back to the model', () => {
    expect(agent.loop).toBe(true)
  })

  it('takes the model from the code and the name from the file', () => {
    expect(agent.model).toBe('gpt-4o')
    expect(agent.name).toBe('Support Graph')
  })
})

describe('agentsFrom: a Vercel AI SDK tools object in TypeScript', () => {
  const [agent] = agentsFrom([file('backend/lib/assistant.ts', VERCEL, ['ai', '@ai-sdk/openai'])], comp)

  it('reads the tools object, the system text and the framework', () => {
    expect(agent.framework).toBe('Vercel AI SDK')
    expect(agent.provider).toBe('OpenAI')
    expect(agent.model).toBeNull()
    expect(agent.instructions).toBe('Você é um assistente de vendas. Responda de forma curta.')
    expect(agent.tools.map((t) => [t.name, t.description])).toEqual([
      ['getLead', 'Get a lead by id.'],
      ['createTask', 'Create a follow-up task for the team.'],
    ])
  })

  it('does not loop by itself, since the SDK runs the steps', () => {
    expect(agent.loop).toBe(false)
  })
})

describe('agentsFrom: tools and prompts that live in other files', () => {
  const tools = file(
    'backend/agent/tools.py',
    `from agents import function_tool

@function_tool
def lookup_price(sku: str) -> str:
    """Look up the price of a product."""
    return "10"
`,
  )
  const prompt = file('backend/agent/prompts/sales.md', 'Você é o vendedor da loja. Seja gentil e objetivo.')
  const agentFile = file(
    'backend/agent/run.py',
    `from openai import OpenAI
from .tools import lookup_price

client = OpenAI()

def run(message):
    return client.chat.completions.create(model="gpt-4o-mini", messages=[], tools=[lookup_price])
`,
    ['openai'],
    ['backend/agent/tools.py', 'backend/agent/prompts/sales.md'],
  )

  it('merges a tools-only file into the agent that imports it, and reads the decorator docstring', () => {
    const [agent] = agentsFrom([agentFile, tools, prompt], comp)
    expect(agent.tools).toEqual([{ name: 'lookup_price', description: 'Look up the price of a product.', file: 'backend/agent/tools.py', line: 3 }])
  })

  it('takes the instructions from an imported prompt file when the code has none', () => {
    const [agent] = agentsFrom([agentFile, tools, prompt], comp)
    expect(agent.instructions).toBe('Você é o vendedor da loja. Seja gentil e objetivo.')
  })

  it('ignores a tools-only file that no agent imports', () => {
    expect(agentsFrom([tools], comp)).toEqual([])
  })
})

describe('agentsFrom: robustness', () => {
  it('never throws on odd or empty input, and skips files it cannot read', () => {
    const odd = file('backend/agent/x.py', 'openai\n' + 'model = ' + '"' + 'a'.repeat(5000) + '\n\'\'\'', ['openai'])
    expect(() => agentsFrom([odd, file('a.ts', ''), file('b.bin', 'openai')], comp)).not.toThrow()
    expect(agentsFrom([], comp)).toEqual([])
  })

  it('keeps a long system prompt short, on a word boundary', () => {
    const long = 'palavra '.repeat(200)
    const [agent] = agentsFrom([file('bot/ai.ts', `const SYSTEM_PROMPT = '${long}'`, ['openai'])], comp)
    expect(agent.instructions?.length).toBeLessThanOrEqual(400)
    expect(agent.instructions?.endsWith('…')).toBe(true)
  })
})
