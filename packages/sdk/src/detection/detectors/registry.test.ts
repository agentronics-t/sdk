import { describe, expect, it } from 'vitest'
import { createDetectorRegistry } from './registry.js'

describe('detector registry', () => {
  it('runs custom detectors before built-ins when supplied directly', async () => {
    const registry = createDetectorRegistry([
      {
        id: 'custom',
        status: 'stable',
        detect: () => ({
          class: 'screenshot',
          trust: 'declared',
          confidence: 1,
          vendor: 'custom',
          userAgent: null,
          detectionVersion: '0.1.2',
          signals: {},
        }),
      },
    ])

    expect((await registry.detectAll())?.vendor).toBe('custom')
  })

  it('skips research detectors unless explicitly enabled', async () => {
    const registry = createDetectorRegistry([
      {
        id: 'research',
        status: 'research',
        detect: () => ({
          class: 'dom',
          trust: 'detected',
          confidence: 0.5,
          vendor: 'research',
          userAgent: null,
          detectionVersion: '0.1.2',
          signals: {},
        }),
      },
    ])

    expect(await registry.detectAll()).toBeNull()
    expect((await registry.detectAll(true))?.vendor).toBe('research')
  })
})
