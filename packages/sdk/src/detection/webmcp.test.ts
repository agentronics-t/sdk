import { afterEach, describe, expect, it } from 'vitest'
import { detectWebMcp } from './webmcp.js'

const setModelContext = (value: unknown) => {
  Object.defineProperty(navigator, 'modelContext', {
    value,
    configurable: true,
    writable: true,
  })
}

const clearModelContext = () => {
  delete (navigator as unknown as { modelContext?: unknown }).modelContext
}

describe('detectWebMcp', () => {
  afterEach(clearModelContext)

  it('returns null when navigator.modelContext is absent', async () => {
    const result = await detectWebMcp({ pollMs: 0 })
    expect(result).toBeNull()
  })

  it('returns an identity when modelContext is present', async () => {
    setModelContext({ vendor: 'claude-extension', tools: [{}, {}] })
    const result = await detectWebMcp({ pollMs: 0 })
    expect(result).toMatchObject({
      class: 'webmcp',
      trust: 'detected',
      confidence: 1,
      vendor: 'claude-extension',
      detectionVersion: '2026.04',
    })
    expect(result?.signals).toMatchObject({ webmcp: true, toolCount: 2 })
  })

  it('polls and resolves when modelContext appears late', async () => {
    setTimeout(() => setModelContext({ vendor: 'late-extension' }), 80)
    const result = await detectWebMcp({ pollMs: 400 })
    expect(result?.vendor).toBe('late-extension')
  })
})
