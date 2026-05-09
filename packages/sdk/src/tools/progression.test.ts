import { describe, expect, it, vi } from 'vitest'
import { createProgressionStore } from './progression.js'

describe('progression store', () => {
  it('starts at the initial stage and exposes enabled stages', () => {
    const store = createProgressionStore({
      initial: 'browse',
      stages: [
        { name: 'browse', enables: ['browse'] },
        { name: 'checkout' },
      ],
    })
    expect(store.current()).toBe('browse')
    expect(store.enabledStages()).toContain('browse')
  })

  it('transitions when a configured tool is invoked and emits a trace', () => {
    const onTrace = vi.fn()
    const store = createProgressionStore(
      {
        initial: 'browse',
        stages: [
          { name: 'browse', transitions: [{ on: 'cart.add', to: 'checkout' }] },
          { name: 'checkout' },
        ],
      },
      { onTrace }
    )
    expect(store.notify('unrelated.tool')).toEqual({ changed: false, from: 'browse', to: 'browse' })
    expect(store.notify('cart.add')).toEqual({ changed: true, from: 'browse', to: 'checkout' })
    expect(store.current()).toBe('checkout')
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool.progressed',
        metadata: expect.objectContaining({ from: 'browse', to: 'checkout', trigger: 'cart.add' }),
      })
    )
  })

  it('throws on unknown initial or transition target', () => {
    expect(() =>
      createProgressionStore({ initial: 'nope', stages: [{ name: 'browse' }] })
    ).toThrow(/Initial stage/)
    const store = createProgressionStore({
      initial: 'a',
      stages: [{ name: 'a' }],
    })
    expect(() => store.set('missing')).toThrow(/unknown stage/)
  })

  it('reset returns to the initial stage', () => {
    const store = createProgressionStore({
      initial: 'browse',
      stages: [
        { name: 'browse', transitions: [{ on: 'go', to: 'checkout' }] },
        { name: 'checkout' },
      ],
    })
    store.notify('go')
    expect(store.current()).toBe('checkout')
    store.reset()
    expect(store.current()).toBe('browse')
  })
})
