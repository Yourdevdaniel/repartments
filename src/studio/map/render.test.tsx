import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentGraph } from './AgentGraph'
import { MapTab } from './MapTab'
import { sampleAgent, sampleChurn, sampleCommit, sampleModel } from './sample'

const common = { churnLoading: false, onLoadChurn: () => {}, commit: null, churn: null }

describe('map components', () => {
  it('renders the map in Portuguese with its band names and accents', () => {
    const html = renderToStaticMarkup(<MapTab model={sampleModel} lang="pt" {...common} />)
    expect(html).toContain('Inteligência')
    expect(html).toContain('Serviços')
    expect(html).toContain('externos')
    expect(html).toContain('PostgreSQL')
    expect(html).toContain('Mapa da arquitetura')
    expect(html).not.toContain('dangerouslySetInnerHTML')
  })

  it('renders in English with the heat and commit overlays available', () => {
    const html = renderToStaticMarkup(<MapTab model={sampleModel} lang="en" {...common} churn={sampleChurn} commit={sampleCommit} />)
    expect(html).toContain('Architecture map')
    expect(html).toContain('External')
    expect(html).toContain('services')
  })

  it('renders an empty state for a model without parts', () => {
    const html = renderToStaticMarkup(<MapTab model={{ ...sampleModel, components: [], externals: [] }} lang="pt" {...common} />)
    expect(html).toContain('Ainda não encontramos partes')
  })

  it('renders an agent graph with its tools and instructions', () => {
    const html = renderToStaticMarkup(<AgentGraph agent={sampleAgent} lang="pt" />)
    expect(html).toContain('buscar_cliente')
    expect(html).toContain('Assistente de vendas')
    expect(html).toContain('Ferramentas')
  })
})
