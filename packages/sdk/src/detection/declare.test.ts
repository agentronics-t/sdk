import { describe, expect, it } from 'vitest'
import { declareAgent } from './declare.js'

describe('declareAgent', () => {
  it('returns a declared identity by default', () => {
    const id = declareAgent({ class: 'screenshot', vendor: 'browser-use' })
    expect(id.class).toBe('screenshot')
    expect(id.trust).toBe('declared')
    expect(id.vendor).toBe('browser-use')
    expect(id.confidence).toBe(1)
  })

  it('upgrades trust to verified when a token is supplied', () => {
    const id = declareAgent({
      class: 'dom',
      vendor: 'acme',
      verificationToken: 'tok_abc',
    })
    expect(id.trust).toBe('verified')
    expect(id.signals).toMatchObject({ hasVerificationToken: true })
  })

  it('rejects unknown agent classes', () => {
    expect(() =>
      declareAgent({ class: 'rogue' as 'webmcp', vendor: 'x' })
    ).toThrow()
  })
})
