import { describe, expect, it } from 'vitest'
import type { AgentIdentity } from '@agentronics/protocol'
import { createIdentityStore } from './identity.js'

const detected = (overrides: Partial<AgentIdentity> = {}): AgentIdentity => ({
  class: 'dom',
  trust: 'detected',
  confidence: 0.6,
  vendor: null,
  userAgent: null,
  detectionVersion: '2026.04',
  signals: {},
  ...overrides,
})

describe('identity store', () => {
  it('returns the detection unchanged when nothing is presented', () => {
    const store = createIdentityStore()
    const id = detected()
    expect(store.preferOver(id)).toBe(id)
  })

  it('returns the presented identity when nothing was detected', () => {
    const store = createIdentityStore()
    store.present({ class: 'screenshot', vendor: 'browser-use', token: 'tok_abcdef12' })
    const result = store.preferOver(null)
    expect(result?.trust).toBe('declared')
    expect(result?.vendor).toBe('browser-use')
  })

  it('prefers a higher-trust presentation over a lower-trust detection', () => {
    const store = createIdentityStore()
    store.present({ class: 'dom', vendor: 'acme', token: 'tok_abcdef12' })
    const result = store.preferOver(detected({ trust: 'detected' }))
    expect(result?.trust).toBe('declared')
    expect(result?.vendor).toBe('acme')
  })

  it('keeps the detection when its trust outranks a presentation', () => {
    const store = createIdentityStore()
    store.present({ class: 'dom', vendor: 'acme', token: 'tok_abcdef12' })
    const verified = detected({ trust: 'verified', vendor: 'cloudflare' })
    expect(store.preferOver(verified)).toBe(verified)
  })

  it('rejects malformed claims', () => {
    const store = createIdentityStore()
    expect(() =>
      store.present({ class: 'dom', vendor: '', token: 'short' })
    ).toThrow(/identity claim/i)
  })

  it('clear() removes the staged identity', () => {
    const store = createIdentityStore()
    store.present({ class: 'dom', vendor: 'acme', token: 'tok_abcdef12' })
    store.clear()
    expect(store.snapshot()).toBeNull()
    expect(store.preferOver(null)).toBeNull()
  })
})
