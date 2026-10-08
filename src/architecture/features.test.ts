import { describe, expect, it } from 'vitest'
import { buttonsOf, commandsOf, featuresOf, htmlTitleOf, mergeFeatures, readmeOf, type Feature } from './features'

const labelsOf = (md: string) => readmeOf(md).features.map((f) => f.label)

describe('readmeOf: the opening sentence', () => {
  it('skips badges and images and takes the first sentence', () => {
    const md = `# Repartments

[![Build](https://img.shields.io/badge/build-ok-green.svg)](https://ci.example.com)
![logo](logo.png)

Splits shared expenses between friends without needing an account. More text follows here.

## Features
`
    expect(readmeOf(md).about).toBe('Splits shared expenses between friends without needing an account.')
  })
})

describe('readmeOf: features from README sections', () => {
  it('reads "**▶ Passo a passo:** …" as a label and its first sentence as the detail', () => {
    const md = `# App

Um site que monta a árvore passo a passo.

## Como usar o site

- **▶ Passo a passo:** roda mostrando cada linha. Mais texto
`
    expect(readmeOf(md).features).toEqual([{ label: 'Passo a passo', detail: 'roda mostrando cada linha.', via: 'readme', ref: null }])
  })

  it('takes a bold item listed before the first H2 as a feature when no section names them', () => {
    const md = `# Fair Split

Splits a bill between the people in the group.

- **Fewest stops** — what's the shortest route…

## Install

Run the thing.
`
    expect(readmeOf(md).features).toEqual([{ label: 'Fewest stops', detail: "what's the shortest route…", via: 'readme', ref: null }])
  })

  it('takes a bold paragraph opening a "O que o site faz" section', () => {
    const md = `# App

Uma ferramenta para organizar listas de compra.

## O que o site faz

**Limpa.** Tira os None e os vazios.
`
    expect(readmeOf(md).features).toEqual([{ label: 'Limpa', detail: 'Tira os None e os vazios.', via: 'readme', ref: null }])
  })

  it('reads the rows of a table under "What\'s in it" with the first column as label and the last as detail', () => {
    const md = `# App

A small tool for finding routes between stops.

## What's in it

| Feature | Status | What it does |
|---|---|---|
| Search | ok | Finds rows fast. |
| Export | ok | Saves a CSV file. |
`
    expect(readmeOf(md).features.map((f) => [f.label, f.detail])).toEqual([
      ['Search', 'Finds rows fast.'],
      ['Export', 'Saves a CSV file.'],
    ])
  })

  it('does not take items from "Como rodar" or "Install" sections', () => {
    const md = `# App

A small tool for splitting bills between friends.

## Features

- **Splits** — divides the bill evenly.

## Como rodar

- **Node 20** — needed to run it.

## Install

- **Step one** — run npm install.
`
    expect(labelsOf(md)).toEqual(['Splits'])
  })

  it('ignores anything inside a fenced code block', () => {
    const md = `# App

A small tool for splitting bills between friends.

## Features

\`\`\`
- **Hidden** — should not appear
\`\`\`

- **Shown** — appears.
`
    expect(labelsOf(md)).toEqual(['Shown'])
  })

  it('keeps the bracketed aside as part of the label: "**Customer** (no account needed): …"', () => {
    const md = `# App

A small tool for booking tables in a restaurant.

## O que o site faz

- **Customer** (no account needed): picks a table and books it.
`
    expect(readmeOf(md).features).toEqual([
      { label: 'Customer (no account needed)', detail: 'picks a table and books it.', via: 'readme', ref: null },
    ])
  })

  it('drops emoji from the middle of a label', () => {
    const md = `# App

A small tool for moving data in and out of a spreadsheet.

## Features

- **📂 Importar / 💾 Exportar** — move seus dados.
`
    expect(labelsOf(md)).toEqual(['Importar / Exportar'])
  })
})

describe('buttonsOf', () => {
  it('reads a JSX button whose handler contains "=>" without breaking the tag', () => {
    const tsx = `export function Nav() {
  return (
    <div>
      <button onClick={() => go(1)}>Avançar tabuleiro</button>
      <button onClick={() => go(-1)}>Fechar</button>
    </div>
  )
}
`
    const found = buttonsOf('src/Nav.tsx', tsx)
    expect(found.map((f) => f.label)).toEqual(['Avançar tabuleiro'])
    expect(found[0].ref).toEqual({ file: 'src/Nav.tsx', line: 4 })
  })

  it('ignores a {expression} child and falls back to the title attribute', () => {
    const tsx = `export const Tree = () => <button title="Ver árvore binária">{icon}</button>
`
    expect(buttonsOf('src/Tree.tsx', tsx).map((f) => f.label)).toEqual(['Ver árvore binária'])
  })

  it('filters navigation buttons like Fechar, Voltar and Próximo', () => {
    const tsx = `export const Nav = () => (
  <>
    <button>Voltar</button>
    <button>Próximo</button>
    <button>Fechar</button>
    <button>Gerar mapa</button>
  </>
)
`
    expect(buttonsOf('src/Nav.tsx', tsx).map((f) => f.label)).toEqual(['Gerar mapa'])
  })

  it('reads a Vue @click element', () => {
    const vue = `<template>
  <div @click="run">Rodar simulação</div>
</template>
`
    expect(buttonsOf('src/Sim.vue', vue).map((f) => f.label)).toEqual(['Rodar simulação'])
  })

  it('reads an Angular (click) element', () => {
    const html = `<span (click)="next()">Montar árvore</span>
`
    expect(buttonsOf('src/app.component.html', html).map((f) => f.label)).toEqual(['Montar árvore'])
  })

  it('reads the value of an input type submit', () => {
    const tsx = `export const Form = () => <input type="submit" value="Enviar" />
`
    expect(buttonsOf('src/Form.tsx', tsx).map((f) => f.label)).toEqual(['Enviar'])
  })
})

describe('commandsOf', () => {
  it('reads a python-telegram-bot CommandHandler as "/start"', () => {
    const py = `from telegram.ext import CommandHandler

application.add_handler(CommandHandler("start", start))
`
    expect(commandsOf('bot/main.py', py).map((f) => [f.label, f.via])).toEqual([['/start', 'command']])
  })

  it('reads an argparse sub-command with its help text', () => {
    const py = `import argparse

sub = parser.add_subparsers()
sub.add_parser("import", help="Imports a statement")
`
    expect(commandsOf('cli.py', py)).toEqual([
      { label: 'import', detail: 'Imports a statement', via: 'command', ref: { file: 'cli.py', line: 4 } },
    ])
  })

  it('reads a commander .command() with its .description()', () => {
    const js = `const program = new Command()
program.command('init').description('Creates the config')
`
    expect(commandsOf('cli.js', js).map((f) => [f.label, f.detail])).toEqual([['init', 'Creates the config']])
  })

  // Source bug: for a one-line docstring the capture keeps the closing quotes, so the detail is
  // 'Convert a bank statement to CSV."""'. Expected 'Convert a bank statement to CSV.'.
  it('reads a typer command from its function name and docstring', () => {
    const py = `import typer

app = typer.Typer()

@app.command()
def convert_file(path: str):
    """Convert a bank statement to CSV."""
    pass
`
    expect(commandsOf('cli.py', py).map((f) => [f.label, f.detail])).toEqual([['convert-file', 'Convert a bank statement to CSV.']])
  })
})

describe('htmlTitleOf', () => {
  it('keeps a real page title', () => {
    expect(htmlTitleOf('<html><head><title>Calculadora de rota</title></head></html>')).toBe('Calculadora de rota')
  })

  it('drops the default titles of Vite and create-react-app templates', () => {
    expect(htmlTitleOf('<title>Vite + React</title>')).toBeNull()
    expect(htmlTitleOf('<title>React App</title>')).toBeNull()
  })
})

describe('mergeFeatures', () => {
  it('puts a README feature confirmed by a button first and gives it the button\'s via and ref', () => {
    const readme: Feature[] = [
      { label: 'Passo a passo', detail: 'roda mostrando cada linha.', via: 'readme', ref: null },
      { label: 'Fewest stops', detail: 'finds the shortest route.', via: 'readme', ref: null },
    ]
    const code: Feature[] = [{ label: 'Fewest stops', detail: null, via: 'button', ref: { file: 'src/Route.tsx', line: 12 } }]
    const merged = mergeFeatures(readme, code)
    expect(merged[0]).toEqual({
      label: 'Fewest stops',
      detail: 'finds the shortest route.',
      via: 'button',
      ref: { file: 'src/Route.tsx', line: 12 },
    })
    expect(merged.map((f) => f.label)).toEqual(['Fewest stops', 'Passo a passo'])
  })

  it('tells at most six features', () => {
    const readme: Feature[] = Array.from({ length: 8 }, (_, i) => ({ label: `Feature ${i + 1}`, detail: null, via: 'readme' as const, ref: null }))
    expect(mergeFeatures(readme, [])).toHaveLength(6)
  })
})

describe('featuresOf: where the about text comes from', () => {
  it('takes the README opening sentence first', () => {
    const files = new Map([
      ['README.md', '# App\n\nSplits shared expenses between friends without an account.\n'],
      ['index.html', '<title>Meu Título</title>'],
    ])
    expect(featuresOf(files, 'Descrição do GitHub.').about).toBe('Splits shared expenses between friends without an account.')
  })

  it('falls back to the GitHub description when the README has no opening sentence', () => {
    const files = new Map([
      ['README.md', '# App\n'],
      ['index.html', '<title>Meu Título</title>'],
    ])
    expect(featuresOf(files, 'Descrição do GitHub.').about).toBe('Descrição do GitHub.')
  })

  it('falls back to the page title when there is neither a README sentence nor a description', () => {
    const files = new Map([
      ['README.md', '# App\n'],
      ['index.html', '<title>Meu Título</title>'],
    ])
    expect(featuresOf(files, null).about).toBe('Meu Título')
  })
})
