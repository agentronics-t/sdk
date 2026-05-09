import { describe, expect, it, vi } from 'vitest'
import { SiteMemory as SiteMemorySchema } from '@agentronics/protocol'
import { createWebMcpContextTool } from './webmcpContext.js'
import { installMetaTags } from './metaTags.js'
import { installMemoryOverlay } from './overlay.js'
import {
  fetchWellKnownContext,
  serializeWellKnownContext,
  WELL_KNOWN_PATH,
} from './wellKnownClient.js'

const baseMemory = SiteMemorySchema.parse({
  version: '1',
  siteMap: {
    pages: [{ path: '/', name: 'Home' }],
    navigation: { flow: 'Home → Cart' },
  },
  workflows: {
    purchase: { steps: [{ step: 1, action: 'Add to cart' }] },
  },
  uiGuidance: {
    addToCart: { selector: '.add-to-cart-btn', behavior: 'Click' },
  },
})

describe('webmcp context tool', () => {
  it('returns the full snapshot when no path is provided', () => {
    const onAccess = vi.fn()
    const tool = createWebMcpContextTool({
      getSnapshot: () => baseMemory,
      onAccess,
    })
    const result = tool.invoke({})
    expect(result.content).toEqual(baseMemory)
    expect(onAccess).toHaveBeenCalledWith(null)
  })

  it('resolves dot-path lookups for narrowed context', () => {
    const tool = createWebMcpContextTool({ getSnapshot: () => baseMemory })
    const result = tool.invoke({ path: 'workflows.purchase.steps.0.action' })
    expect(result.content).toBe('Add to cart')
  })
})

describe('metaTags delivery', () => {
  it('writes meta tags and JSON-LD into the document head', () => {
    document.head.innerHTML = ''
    const handle = installMetaTags({ snapshot: baseMemory })

    expect(document.querySelector('meta[name="agent-context-version"]')?.getAttribute('content')).toBe(
      '1'
    )
    expect(document.querySelector('meta[name="agent-context-flow"]')?.getAttribute('content')).toBe(
      'Home → Cart'
    )
    const script = document.getElementById('agentronics-site-context') as HTMLScriptElement | null
    expect(script).not.toBeNull()
    expect(script?.type).toBe('application/ld+json')
    const parsed = JSON.parse(script!.textContent ?? '{}') as {
      agentronics: { siteMap: { pages: { name?: string }[] } }
    }
    expect(parsed.agentronics.siteMap.pages[0]?.name).toBe('Home')

    handle.uninstall()
    expect(document.querySelector('meta[name="agent-context-version"]')).toBeNull()
    expect(document.getElementById('agentronics-site-context')).toBeNull()
  })
})

describe('memory overlay delivery', () => {
  it('summarizes memory into an accessible overlay node', () => {
    document.body.innerHTML = ''
    const handle = installMemoryOverlay({ snapshot: baseMemory })
    const node = document.getElementById('agentronics-memory-overlay')
    expect(node?.getAttribute('role')).toBe('note')
    expect(node?.textContent).toContain('pages:1')
    expect(node?.textContent).toContain('workflows:1')

    handle.refresh({ ...baseMemory, workflows: {} })
    expect(node?.textContent).toContain('workflows:0')

    handle.uninstall()
    expect(document.getElementById('agentronics-memory-overlay')).toBeNull()
  })
})

describe('well-known client', () => {
  it('fetches and parses /.well-known/agent-context.json', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(baseMemory), { headers: { 'content-type': 'application/json' } })
    )
    const memory = await fetchWellKnownContext({
      origin: 'https://shop.example',
      fetcher,
    })
    expect(memory?.siteMap?.pages[0]?.name).toBe('Home')
    expect(fetcher).toHaveBeenCalledWith(
      `https://shop.example${WELL_KNOWN_PATH}`,
      expect.any(Object)
    )
  })

  it('returns null when the host has no well-known document', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }))
    const memory = await fetchWellKnownContext({
      origin: 'https://shop.example',
      fetcher,
    })
    expect(memory).toBeNull()
  })

  it('serializes a snapshot for hosts to publish', () => {
    const json = serializeWellKnownContext({ snapshot: baseMemory })
    expect(JSON.parse(json).version).toBe('1')
  })
})
