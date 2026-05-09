import { describe, expect, it, vi } from 'vitest'
import { createSiteMemoryStore } from './siteMemory.js'

describe('site memory store', () => {
  it('provides and merges enterprise context', () => {
    const onTrace = vi.fn()
    const store = createSiteMemoryStore({ onTrace })

    const snapshot = store.provide({
      siteMap: {
        pages: [{ path: '/', name: 'Home' }],
        navigation: { flow: 'Home → Cart' },
      },
      workflows: {
        purchase: { steps: [{ step: 1, action: 'Add to cart' }] },
      },
    })

    expect(snapshot.siteMap?.pages).toHaveLength(1)
    expect(snapshot.workflows.purchase?.steps[0]?.action).toBe('Add to cart')
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'memory.updated' })
    )
  })

  it('keeps siblings when merging partial provides', () => {
    const store = createSiteMemoryStore()
    store.provide({ workflows: { purchase: { steps: [{ step: 1, action: 'a' }] } } })
    store.provide({ workflows: { returns: { steps: [{ step: 1, action: 'b' }] } } })

    const snapshot = store.snapshot()
    expect(Object.keys(snapshot.workflows)).toEqual(['purchase', 'returns'])
  })

  it('applies dot-path updates and emits a trace', () => {
    const onTrace = vi.fn()
    const store = createSiteMemoryStore({ onTrace })
    store.provide({ policies: { shipping: 'standard' } })
    store.update('policies.shipping', 'free over $35')

    expect(store.snapshot().policies.shipping).toBe('free over $35')
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ operation: 'update' }) })
    )
  })

  it('resolves dot-path reads through get()', () => {
    const store = createSiteMemoryStore({
      initial: { workflows: { purchase: { steps: [{ step: 1, action: 'click' }] } } },
    })
    expect(store.get('workflows.purchase.steps.0.action')).toBe('click')
    expect(store.get('does.not.exist')).toBeUndefined()
  })

  it('stores per-page context and reads it back', () => {
    const store = createSiteMemoryStore()
    store.provideForPage({
      path: '/checkout',
      payload: { currentStep: 'order-review', estimatedTotal: 49.99 },
    })

    const found = store.getForPage('/checkout')
    expect(found?.payload).toEqual({ currentStep: 'order-review', estimatedTotal: 49.99 })
    expect(store.getForPage('/missing')).toBeNull()
  })

  it('replaces the snapshot wholesale (used by gateway sync)', () => {
    const store = createSiteMemoryStore()
    store.replace({
      version: '2',
      siteMap: { pages: [{ path: '/p' }], navigation: { flow: 'home' } },
      workflows: {},
      policies: {},
      uiGuidance: {},
      pageContexts: {},
    })
    expect(store.snapshot().version).toBe('2')
    expect(store.snapshot().siteMap?.pages[0]?.path).toBe('/p')
  })
})
